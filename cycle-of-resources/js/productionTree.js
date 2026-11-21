/* Цикл ресурсов — вертикальное дерево производства: сырьё сверху, изделия ниже. */
(function () {
  const D = window.COR.DATA;
  const U = window.COR.util;
  const NODE_W = 176;
  const NODE_H = 92;
  const GAP_X = 18;
  const GAP_Y = 40;
  const PAD = 46;

  class ProductionTree {
    constructor(game, opts) {
      this.game = game;
      this.opts = opts || {};
      this.viewport = document.getElementById("prodViewport");
      this.space = document.getElementById("prodSpace");
      this.world = document.getElementById("prodWorld");
      this.svg = document.getElementById("prodEdges");
      this.nodesEl = document.getElementById("prodNodes");
      this.nodeCountEl = document.getElementById("prodNodeCount");
      this.zoom = 0.9;
      this.selected = null;
      this.positions = {};
      this.depths = {};
      this.edges = [];
      this.signature = "";
      this.width = 1000;
      this.height = 600;
      this.drag = null;
      this.itemOrder = {};
      Object.keys(D.ITEMS).forEach((id, i) => { this.itemOrder[id] = i; });
      this.bind();
      this.rebuild(true);
    }

    bind() {
      document.querySelectorAll("[data-prod-zoom]").forEach(btn => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.prodZoom;
          if (mode === "in") this.setZoom(this.zoom + 0.1);
          else if (mode === "out") this.setZoom(this.zoom - 0.1);
          else this.fit();
        });
      });

      this.viewport.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".prod-node")) return;
        this.drag = {
          x: e.clientX,
          y: e.clientY,
          left: this.viewport.scrollLeft,
          top: this.viewport.scrollTop
        };
        this.viewport.classList.add("dragging");
        this.viewport.setPointerCapture(e.pointerId);
      });
      this.viewport.addEventListener("pointermove", (e) => {
        if (!this.drag) return;
        this.viewport.scrollLeft = this.drag.left - (e.clientX - this.drag.x);
        this.viewport.scrollTop = this.drag.top - (e.clientY - this.drag.y);
      });
      const endDrag = () => {
        this.drag = null;
        this.viewport.classList.remove("dragging");
      };
      this.viewport.addEventListener("pointerup", endDrag);
      this.viewport.addEventListener("pointercancel", endDrag);
      this.viewport.addEventListener("wheel", (e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        this.setZoom(this.zoom + (e.deltaY > 0 ? -0.08 : 0.08));
      }, { passive: false });

      this.nodesEl.addEventListener("click", (e) => {
        const node = e.target.closest("[data-prod-item]");
        if (!node) return;
        this.selected = node.dataset.prodItem;
        this.setSelected(this.selected);
        if (this.opts.onSelect) this.opts.onSelect(this.selected);
      });
    }

    knownIds() {
      return Object.keys(D.ITEMS).filter(id => this.game.isKnown(id));
    }

    currentSignature() {
      return this.knownIds().sort().join(",") + "|" +
        Array.from(this.game.unlocked.recipes).sort().join(",");
    }

    rebuild(force) {
      const sig = this.currentSignature();
      if (!force && sig === this.signature) return false;
      this.signature = sig;
      const known = this.knownIds();
      this.nodes = known;
      this.computeLayout(known);
      this.render();
      this.updateLive();
      return true;
    }

    maybeRebuild() {
      if (this.currentSignature() !== this.signature) this.rebuild(false);
    }

    computeLayout(known) {
      const knownSet = new Set(known);
      const recipes = D.RECIPES.filter(r => this.game.unlocked.recipes.has(r.id));
      const produced = new Set();
      for (const r of recipes) Object.keys(r.outputs || {}).forEach(id => produced.add(id));

      const depth = {};
      for (const id of known) {
        depth[id] = (D.ITEMS[id].kind === "raw" || !produced.has(id)) ? 0 : Infinity;
      }

      for (let iter = 0; iter < known.length + 2; iter += 1) {
        let changed = false;
        for (const r of recipes) {
          let maxIn = -1;
          let ready = true;
          for (const input of Object.keys(r.inputs || {})) {
            if (!(input in depth) || depth[input] === Infinity) { ready = false; break; }
            maxIn = Math.max(maxIn, depth[input]);
          }
          if (!ready) continue;
          const d = maxIn + 1;
          for (const out of Object.keys(r.outputs || {})) {
            if (!(out in depth)) continue;
            if (D.ITEMS[out].kind === "raw") continue;
            if (d < depth[out]) { depth[out] = d; changed = true; }
          }
        }
        if (!changed) break;
      }

      let maxFinite = 0;
      for (const id of known) if (depth[id] !== Infinity) maxFinite = Math.max(maxFinite, depth[id]);
      for (const id of known) if (depth[id] === Infinity) depth[id] = maxFinite + 1;

      this.depths = depth;

      const edgeMap = new Map();
      for (const r of recipes) {
        const alt = r.id.indexOf("alternate") === 0;
        for (const from of Object.keys(r.inputs || {})) {
          if (!knownSet.has(from)) continue;
          for (const to of Object.keys(r.outputs || {})) {
            if (!knownSet.has(to) || from === to) continue;
            if (!(depth[from] < depth[to])) continue;
            const key = from + ">" + to;
            const prev = edgeMap.get(key);
            if (!prev || (prev.alt && !alt)) edgeMap.set(key, { from, to, alt, rid: r.id });
          }
        }
      }
      this.edges = Array.from(edgeMap.values());

      const byDepth = new Map();
      for (const id of known) {
        const d = depth[id];
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d).push(id);
      }
      const maxDepth = byDepth.size ? Math.max(...byDepth.keys()) : 0;
      for (const list of byDepth.values()) {
        list.sort((a, b) => this.itemOrder[a] - this.itemOrder[b]);
      }

      let maxCount = 1;
      for (const list of byDepth.values()) maxCount = Math.max(maxCount, list.length);
      this.width = PAD * 2 + maxCount * NODE_W + Math.max(0, maxCount - 1) * GAP_X;
      this.height = PAD * 2 + (maxDepth + 1) * NODE_H + maxDepth * GAP_Y;
      this.maxDepth = maxDepth;

      const rowX = (list) => {
        const rowW = list.length * NODE_W + Math.max(0, list.length - 1) * GAP_X;
        return PAD + Math.max(0, (this.width - PAD * 2 - rowW) / 2);
      };

      const pos = {};
      for (const [d, list] of byDepth) {
        const x0 = rowX(list);
        const y = PAD + d * (NODE_H + GAP_Y);
        list.forEach((id, i) => {
          pos[id] = { x: x0 + i * (NODE_W + GAP_X), y, depth: d };
        });
      }

      /* Несколько проходов барицентра уменьшают пересечения связей. */
      const parents = new Map();
      for (const e of this.edges) {
        if (!parents.has(e.to)) parents.set(e.to, []);
        parents.get(e.to).push(e.from);
      }
      for (let pass = 0; pass < 3; pass += 1) {
        for (let d = 1; d <= maxDepth; d += 1) {
          const list = byDepth.get(d) || [];
          if (!list.length) continue;
          const scored = list.map((id, i) => {
            const ps = parents.get(id) || [];
            let sum = 0;
            let n = 0;
            for (const p of ps) {
              if (!pos[p]) continue;
              sum += pos[p].x + NODE_W / 2;
              n += 1;
            }
            return { id, i, score: n ? sum / n : Infinity };
          });
          scored.sort((a, b) => {
            if (a.score === b.score) return a.i - b.i;
            if (!Number.isFinite(a.score)) return 1;
            if (!Number.isFinite(b.score)) return -1;
            return a.score - b.score;
          });
          const x0 = rowX(list);
          scored.forEach((item, i) => {
            pos[item.id].x = x0 + i * (NODE_W + GAP_X);
          });
        }
      }

      this.positions = pos;
    }

    balanceInfo(id) {
      const stats = this.game.getItemStats(id);
      const value = stats.balance;
      if (!Number.isFinite(value) || Math.abs(value) < 0.0005) {
        return { text: "0/с", cls: "zero" };
      }
      return {
        text: `${U.fmtSigned(value)}/с`,
        cls: value > 0 ? "good" : "bad"
      };
    }

    nodeClass(id) {
      const item = D.ITEMS[id];
      const stats = this.game.getItemStats(id);
      const classes = ["prod-node"];
      classes.push(item.kind === "raw" ? "raw" : "made");
      if (stats.balance > 0.0005) classes.push("surplus");
      else if (stats.balance < -0.0005) classes.push("deficit");
      if (this.selected === id) classes.push("selected");
      return classes.join(" ");
    }

    render() {
      this.world.style.width = this.width + "px";
      this.world.style.height = this.height + "px";
      this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
      this.svg.setAttribute("width", this.width);
      this.svg.setAttribute("height", this.height);

      this.svg.innerHTML = `<defs>
        <marker id="prod-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#476579"></path>
        </marker>
      </defs>`;

      const edgeFrag = document.createDocumentFragment();
      for (const e of this.edges) {
        const a = this.positions[e.from];
        const b = this.positions[e.to];
        if (!a || !b) continue;
        const x1 = a.x + NODE_W / 2;
        const y1 = a.y + NODE_H;
        const x2 = b.x + NODE_W / 2;
        const y2 = b.y;
        const mid = y1 + (y2 - y1) / 2;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
        path.setAttribute("class", "prod-edge" + (e.alt ? " alt" : ""));
        path.setAttribute("marker-end", "url(#prod-arrow)");
        edgeFrag.appendChild(path);
      }
      this.svg.appendChild(edgeFrag);

      const nodeFrag = document.createDocumentFragment();
      const layerLabels = document.createDocumentFragment();
      const byDepth = new Map();
      for (const id of this.nodes) {
        const d = this.depths[id];
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d).push(id);
      }
      for (const [d, list] of byDepth) {
        const label = document.createElement("div");
        label.className = "prod-layer-label";
        label.style.top = (PAD + d * (NODE_H + GAP_Y) + NODE_H / 2) + "px";
        label.textContent = d === 0 ? "СЫРЬЁ" : `${d}-Й ПЕРЕДЕЛ`;
        layerLabels.appendChild(label);
      }
      this.nodesEl.innerHTML = "";
      this.nodesEl.appendChild(layerLabels);

      for (const id of this.nodes) {
        const item = D.ITEMS[id];
        const pos = this.positions[id];
        if (!pos) continue;
        const qty = this.game.items[id] || 0;
        const bal = this.balanceInfo(id);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = this.nodeClass(id);
        btn.dataset.prodItem = id;
        btn.style.left = pos.x + "px";
        btn.style.top = pos.y + "px";
        btn.style.width = NODE_W + "px";
        btn.style.height = NODE_H + "px";
        btn.title = `${item.name}: ${U.fmt(qty)} · баланс ${bal.text}`;
        btn.setAttribute("aria-label", `${item.name}, на складе ${U.fmt(qty)}, баланс ${bal.text}`);
        btn.innerHTML = `
          <span class="pn-top">
            <span class="pn-icon" aria-hidden="true">${item.icon}</span>
            <span class="pn-name">${U.escapeHtml(item.name)}</span>
          </span>
          <span class="pn-qty">${U.fmt(qty)}</span>
          <span class="pn-balance ${bal.cls}">${bal.text}</span>`;
        nodeFrag.appendChild(btn);
      }
      this.nodesEl.appendChild(nodeFrag);

      if (this.nodeCountEl) this.nodeCountEl.textContent = U.fmtInt(this.nodes.length);
      this.space.style.width = this.width * this.zoom + "px";
      this.space.style.height = this.height * this.zoom + "px";
      this.world.style.transform = `scale(${this.zoom})`;
      this.world.style.transformOrigin = "0 0";
      this.updateLive();
    }

    updateLive() {
      if (!this.nodesEl) return;
      this.nodesEl.querySelectorAll("[data-prod-item]").forEach(btn => {
        const id = btn.dataset.prodItem;
        const qty = this.game.items[id] || 0;
        const bal = this.balanceInfo(id);
        const qtyEl = btn.querySelector(".pn-qty");
        const balEl = btn.querySelector(".pn-balance");
        if (qtyEl) qtyEl.textContent = U.fmt(qty);
        if (balEl) {
          balEl.textContent = bal.text;
          balEl.className = "pn-balance " + bal.cls;
        }
        btn.className = this.nodeClass(id);
      });
    }

    setSelected(id) {
      this.selected = id;
      this.nodesEl.querySelectorAll("[data-prod-item]").forEach(el => {
        el.classList.toggle("selected", el.dataset.prodItem === id);
      });
    }

    focusItem(id) {
      if (!this.positions[id]) this.rebuild(true);
      if (!this.positions[id]) return false;
      this.setSelected(id);
      this.centerOn(id);
      return true;
    }

    setZoom(z, keepCenter) {
      const next = U.clamp(z, 0.28, 1.45);
      const old = this.zoom;
      this.zoom = next;
      this.space.style.width = this.width * next + "px";
      this.space.style.height = this.height * next + "px";
      this.world.style.transform = `scale(${next})`;
      if (keepCenter !== false && old !== next && this.viewport) {
        const cx = (this.viewport.scrollLeft + this.viewport.clientWidth / 2) / old;
        const cy = (this.viewport.scrollTop + this.viewport.clientHeight / 2) / old;
        this.viewport.scrollLeft = cx * next - this.viewport.clientWidth / 2;
        this.viewport.scrollTop = cy * next - this.viewport.clientHeight / 2;
      }
    }

    centerOn(id) {
      const pos = this.positions[id];
      if (!pos || !this.viewport.clientWidth) return;
      const x = (pos.x + NODE_W / 2) * this.zoom;
      const y = (pos.y + NODE_H / 2) * this.zoom;
      this.viewport.scrollLeft = Math.max(0, x - this.viewport.clientWidth / 2);
      this.viewport.scrollTop = Math.max(0, y - this.viewport.clientHeight / 2);
    }

    fit() {
      if (!this.viewport.clientWidth || !this.viewport.clientHeight) return;
      const z = Math.min(
        (this.viewport.clientWidth - 22) / this.width,
        (this.viewport.clientHeight - 22) / this.height
      );
      this.setZoom(z, false);
      this.viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    }
  }

  window.COR.ProductionTree = ProductionTree;
})();
