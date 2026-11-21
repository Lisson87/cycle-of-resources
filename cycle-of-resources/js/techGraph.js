/* Цикл ресурсов — направленный граф технологий с панорамированием и зумом. */
(function () {
  const D = window.COR.DATA;
  const U = window.COR.util;
  const RECIPES_BY_ID = {};
  D.RECIPES.forEach(r => { RECIPES_BY_ID[r.id] = r; });
  const NODE_W = 206;
  const NODE_H = 78;
  const COL_W = 272;
  const ROW_H = 96;
  const PAD = 44;

  class TechGraph {
    constructor(game, opts) {
      this.game = game;
      this.opts = opts || {};
      this.dialog = document.getElementById("techDialog");
      this.viewport = document.getElementById("treeViewport");
      this.space = document.getElementById("treeSpace");
      this.world = document.getElementById("treeWorld");
      this.svg = document.getElementById("treeEdges");
      this.nodesEl = document.getElementById("treeNodes");
      this.detailEl = document.getElementById("techDetail");
      this.progressLabel = document.getElementById("techProgressLabel");
      this.progressBar = document.getElementById("techProgressBar");
      this.zoom = 0.86;
      this.selected = null;
      this.nodeEls = {};
      this.edgeEls = [];
      this.drag = null;

      this.buildLayout();
      this.renderGraph();
      this.bind();
      this.refresh();
    }

    buildLayout() {
      const byTier = new Map();
      for (const t of D.TECH) {
        if (!byTier.has(t.tier)) byTier.set(t.tier, []);
        byTier.get(t.tier).push(t);
      }
      const maxCount = Math.max(...Array.from(byTier.values(), list => list.length));
      this.maxCount = maxCount;
      this.width = PAD * 2 + 9 * COL_W;
      this.height = Math.max(PAD * 2 + maxCount * ROW_H, 560);
      this.positions = {};
      for (let tier = 1; tier <= 9; tier += 1) {
        const list = byTier.get(tier) || [];
        const startY = PAD + ((maxCount - list.length) * ROW_H) / 2;
        list.forEach((t, i) => {
          this.positions[t.id] = {
            x: PAD + (tier - 1) * COL_W,
            y: startY + i * ROW_H
          };
        });
      }
      this.world.style.width = this.width + "px";
      this.world.style.height = this.height + "px";
      this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
      this.svg.setAttribute("width", this.width);
      this.svg.setAttribute("height", this.height);
      this.setZoom(this.zoom, false);
    }

    statusFor(t) {
      if (this.game.techs.includes(t.id)) return "researched";
      const check = this.game.canResearch(t.id);
      if (check.ok) return "available";
      const reqsMet = (t.requires || []).every(id => this.game.techs.includes(id));
      return reqsMet ? "open" : "locked";
    }

    statusLabel(status) {
      return {
        researched: "Изучено",
        available: "Доступно",
        open: "Нужны ресурсы",
        locked: "Закрыто"
      }[status] || "";
    }

    statusGlyph(status) {
      return { researched: "✓", available: "●", open: "◐", locked: "🔒" }[status] || "";
    }

    costRatio(t) {
      const costs = this.game.getTechCost(t.id);
      if (!costs.length) return 1;
      let min = 1;
      for (const c of costs) min = Math.min(min, c.need > 0 ? c.have / c.need : 1);
      return U.clamp(min, 0, 1);
    }

    renderGraph() {
      this.svg.innerHTML = `<defs>
        <marker id="tech-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#4a6678"></path>
        </marker>
      </defs>`;

      const frag = document.createDocumentFragment();
      const edgeFrag = document.createDocumentFragment();
      for (const t of D.TECH) {
        for (const req of t.requires || []) {
          const a = this.positions[req];
          const b = this.positions[t.id];
          if (!a || !b) continue;
          let d;
          if (Math.abs(a.x - b.x) < 1) {
            /* Зависимость внутри одного уровня: обводим колонку слева,
               иначе ребро проходит сквозь промежуточные узлы. */
            const x1 = a.x;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const out = a.x - 28;
            d = `M ${x1} ${y1} C ${out} ${y1}, ${out} ${y2}, ${x2} ${y2}`;
          } else {
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const dx = Math.max(36, Math.abs(x2 - x1) * 0.45);
            d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
          }
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", d);
          path.setAttribute("class", "tech-edge");
          path.setAttribute("marker-end", "url(#tech-arrow)");
          edgeFrag.appendChild(path);
          this.edgeEls.push({ from: req, to: t.id, el: path });
        }
      }
      this.svg.appendChild(edgeFrag);

      for (const t of D.TECH) {
        const pos = this.positions[t.id];
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tech-node";
        btn.style.left = pos.x + "px";
        btn.style.top = pos.y + "px";
        btn.dataset.techId = t.id;
        btn.innerHTML = `
          <span class="tn-icon" aria-hidden="true">${t.icon}</span>
          <span class="tn-copy">
            <span class="tn-tier">Уровень ${t.tier}</span>
            <span class="tn-title">${U.escapeHtml(t.title)}</span>
          </span>
          <span class="tn-state" aria-hidden="true"></span>
          <span class="tn-bar"><i></i></span>`;
        btn.addEventListener("click", () => this.select(t.id));
        this.nodeEls[t.id] = btn;
        frag.appendChild(btn);
      }
      this.nodesEl.appendChild(frag);

      this.detailEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-research]");
        if (btn && this.opts.onResearch) this.opts.onResearch(btn.dataset.research);
      });
    }

    bind() {
      this.dialog.querySelectorAll("[data-zoom]").forEach(btn => {
        btn.addEventListener("click", () => {
          const mode = btn.dataset.zoom;
          if (mode === "in") this.setZoom(this.zoom + 0.1);
          else if (mode === "out") this.setZoom(this.zoom - 0.1);
          else this.fit();
        });
      });

      this.viewport.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest(".tech-node")) return;
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
    }

    setZoom(z, keepCenter) {
      const next = U.clamp(z, 0.4, 1.35);
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

    fit() {
      const w = this.viewport.clientWidth;
      const h = this.viewport.clientHeight;
      if (!w || !h) return;
      const z = Math.min((w - 22) / this.width, (h - 22) / this.height);
      this.setZoom(z, false);
      this.viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    }

    centerOn(id) {
      const pos = this.positions[id];
      if (!pos) return;
      /* На мобильном dialog получает размеры не сразу; без этой проверки
         clientWidth = 0 уводил граф далеко вправо. */
      if (!this.viewport.clientWidth || !this.viewport.clientHeight) return;
      const x = (pos.x + NODE_W / 2) * this.zoom;
      const y = (pos.y + NODE_H / 2) * this.zoom;
      this.viewport.scrollLeft = Math.max(0, x - this.viewport.clientWidth / 2);
      this.viewport.scrollTop = Math.max(0, y - this.viewport.clientHeight / 2);
    }

    defaultTech() {
      const available = this.game.getAvailableTechs();
      if (available.length) return available[0].id;
      const open = D.TECH.find(t => !this.game.techs.includes(t.id) && this.statusFor(t) === "open");
      return open ? open.id : D.TECH[D.TECH.length - 1].id;
    }

    open(id) {
      if (!this.dialog.open) this.dialog.showModal();
      this.viewport.scrollLeft = 0;
      this.viewport.scrollTop = 0;
      const chosen = id && this.positions[id] ? id : (this.selected || this.defaultTech());
      this.select(chosen, true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!this.viewport.clientWidth) return;
          if (this.zoom < 0.6) this.setZoom(0.72, false);
          this.centerOn(chosen);
        });
      });
    }

    select(id, center) {
      if (!this.positions[id]) return;
      this.selected = id;
      this.refresh();
      if (center) this.centerOn(id);
    }

    updateProgress() {
      const total = D.TECH.length;
      const done = this.game.techs.length;
      const pct = total ? (done / total) * 100 : 0;
      if (this.progressLabel) this.progressLabel.textContent = `${done} / ${total}`;
      if (this.progressBar) this.progressBar.style.width = pct + "%";
    }

    refresh() {
      for (const t of D.TECH) {
        const el = this.nodeEls[t.id];
        if (!el) continue;
        const status = this.statusFor(t);
        const ratio = status === "researched" || status === "available" ? 1 : this.costRatio(t);
        el.className = "tech-node " + status + (this.selected === t.id ? " selected" : "");
        el.title = `${t.title} · ${this.statusLabel(status)}`;
        el.setAttribute("aria-label", `${t.title}, уровень ${t.tier}, ${this.statusLabel(status)}`);
        const state = el.querySelector(".tn-state");
        if (state) state.textContent = this.statusGlyph(status);
        const bar = el.querySelector(".tn-bar i");
        if (bar) bar.style.width = (ratio * 100).toFixed(1) + "%";
      }

      for (const edge of this.edgeEls) {
        const t = D.TECH_BY_ID[edge.to];
        const status = t ? this.statusFor(t) : "locked";
        edge.el.setAttribute("class", "tech-edge " + status);
      }

      this.updateProgress();
      this.renderDetail(this.selected);
    }

    renderDetail(id) {
      if (!id || !D.TECH_BY_ID[id]) {
        this.detailEl.innerHTML = `<div class="tech-detail-empty">Выберите узел на графе, чтобы увидеть стоимость, зависимости и открываемые рецепты.</div>`;
        return;
      }
      const t = D.TECH_BY_ID[id];
      const status = this.statusFor(t);
      const costs = this.game.getTechCost(t.id);
      const check = this.game.canResearch(t.id);
      const reqs = (t.requires || []).map(rid => ({ id: rid, tech: D.TECH_BY_ID[rid], done: this.game.techs.includes(rid) }));

      const costHtml = costs.length ? costs.map(c => {
        const item = D.ITEMS[c.itemId];
        const pct = c.need > 0 ? U.clamp((c.have / c.need) * 100, 0, 100) : 100;
        return `<div class="td-cost ${c.ok ? "ok" : "miss"}">
          <span class="c-ico" aria-hidden="true">${item.icon}</span>
          <span class="c-name">${U.escapeHtml(item.name)}</span>
          <span class="c-num">${U.fmt(c.have)} / ${U.fmt(c.need)}</span>
          <span class="c-bar"><i style="width:${pct.toFixed(1)}%"></i></span>
        </div>`;
      }).join("") : `<div class="td-cost ok"><span class="c-ico">✓</span><span class="c-name">Бесплатно</span><span class="c-num">0</span></div>`;

      const reqHtml = reqs.length ? reqs.map(r => `<span class="td-req ${r.done ? "ok" : ""}">${r.done ? "✓ " : ""}${U.escapeHtml(r.tech ? r.tech.title : r.id)}</span>`).join("")
        : `<span class="td-req ok">✓ Начальное исследование</span>`;

      const unlocks = t.unlocks || {};
      const machineChips = (unlocks.machines || []).map(mid => {
        const m = D.MACHINES[mid];
        return `<span class="td-unlock-chip" title="${U.escapeHtml(m.desc || "")}"><span>${m.icon}</span>${U.escapeHtml(m.name)}</span>`;
      }).join("");

      const resourceChips = (unlocks.resources || []).map(rid => {
        const item = D.ITEMS[rid];
        return `<span class="td-unlock-chip"><span>${item.icon}</span>${U.escapeHtml(item.name)} · ручная добыча</span>`;
      }).join("");

      const recipeIds = unlocks.recipes || [];
      const outputItems = [];
      const seen = new Set();
      for (const rid of recipeIds) {
        const r = RECIPES_BY_ID[rid];
        if (!r) continue;
        for (const itemId of Object.keys(r.outputs || {})) {
          if (!D.ITEMS[itemId] || seen.has(itemId)) continue;
          seen.add(itemId);
          outputItems.push(itemId);
        }
      }
      const itemChips = outputItems.slice(0, 10).map(itemId => {
        const item = D.ITEMS[itemId];
        return `<span class="td-unlock-chip"><span>${item.icon}</span>${U.escapeHtml(item.name)}</span>`;
      }).join("");
      const more = outputItems.length > 10 ? `<span class="td-unlock-chip">+${outputItems.length - 10}</span>` : "";

      const effectText = [];
      if (t.effect) {
        if (t.effect.clickMult) effectText.push(`Ручная добыча ×${t.effect.clickMult}`);
        if (t.effect.extractMult) effectText.push(`Добыча зданий ×${t.effect.extractMult}`);
        if (t.effect.prodMult) effectText.push(`Всё производство ×${t.effect.prodMult}`);
      }

      const statusText = t.id === this.selected ? this.statusLabel(status) : "";
      const action = status === "researched"
        ? `<button class="btn wide" type="button" disabled>✓ Исследовано</button>`
        : status === "available"
          ? `<button class="btn primary wide" type="button" data-research="${t.id}">Исследовать</button>`
          : `<button class="btn wide" type="button" disabled>${status === "open" ? "Не хватает ресурсов" : "Сначала изучите зависимости"}</button>`;

      const note = status === "open"
        ? `<div class="td-note">Накопите указанные ресурсы на складе — кнопка станет доступна.</div>`
        : status === "locked"
          ? `<div class="td-note">Сначала завершите исследования слева на графе.</div>`
          : status === "researched"
            ? `<div class="td-note">Бонус уже действует. Награда: ${t.crystals || 0} 💠.</div>`
            : `<div class="td-note">Стоимость списывается со склада один раз.</div>`;

      this.detailEl.innerHTML = `
        <div class="td-head">
          <div class="td-icon" aria-hidden="true">${t.icon}</div>
          <div>
            <h3 class="td-title">${U.escapeHtml(t.title)}</h3>
            <div class="td-sub">Уровень ${t.tier} · ${U.escapeHtml(statusText)}</div>
            <span class="td-status ${status}">${this.statusGlyph(status)} ${U.escapeHtml(this.statusLabel(status))}</span>
          </div>
        </div>
        <p class="td-desc">${U.escapeHtml(t.description)}</p>

        <div class="td-section">
          <h4 class="td-section-title">Стоимость</h4>
          <div class="td-costs">${costHtml}</div>
          <div class="td-req-list" style="margin-top:6px">${reqHtml}</div>
        </div>

        ${effectText.length ? `<div class="td-section"><div class="td-effect">${effectText.join(" · ")}</div></div>` : ""}

        <div class="td-section">
          <h4 class="td-section-title">Открывает</h4>
          ${machineChips ? `<div class="td-unlock-group"><div class="td-unlock-label">Здания</div><div class="td-unlock-chips">${machineChips}</div></div>` : ""}
          ${resourceChips ? `<div class="td-unlock-group"><div class="td-unlock-label">Новое сырьё</div><div class="td-unlock-chips">${resourceChips}</div></div>` : ""}
          ${itemChips ? `<div class="td-unlock-group"><div class="td-unlock-label">Предметы и рецепты · ${recipeIds.length}</div><div class="td-unlock-chips">${itemChips}${more}</div></div>` : ""}
          ${!machineChips && !resourceChips && !itemChips ? `<div class="td-note">Только постоянный бонус.</div>` : ""}
        </div>

        <div class="td-action">${action}</div>
        ${note}
        ${status === "available" && check.reason === "cost" ? "" : ""}
      `;
    }
  }

  window.COR.TechGraph = TechGraph;
})();
