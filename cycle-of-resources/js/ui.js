/* Цикл ресурсов — интерфейс: склад, инспектор, производство, развитие. */
(function () {
  const D = window.COR.DATA;
  const U = window.COR.util;
  const KIND_LABEL = { raw: "Сырьё", ingot: "Слиток", material: "Материал", part: "Компонент" };
  const STATUS_LABEL = {
    researched: "Изучено",
    available: "Доступно",
    open: "Нужны ресурсы",
    locked: "Закрыто"
  };
  const $ = id => document.getElementById(id);

  class UI {
    constructor(game, sound, ambient) {
      this.game = game;
      this.sound = sound;
      this.ambient = ambient;

      this.sideTab = "properties";
      this.mobileView = "tree";
      this.recipeSearch = "";
      this.recipeMachine = "all";
      this.exportString = "";

      this.lastFast = 0;
      this.lastOverview = 0;
      this.lastSideLive = 0;
      this.lastTechRefresh = 0;
      this.lastBadges = 0;
      this.searchMatches = [];
      this.searchActive = -1;
      this.resetArmed = false;
      this.resetTimer = null;

      this.dom = {
        productionPanel: $("productionPanel"),
        prodSearch: $("prodSearch"),
        clearProdSearch: $("clearProdSearch"),
        prodSearchResults: $("prodSearchResults"),
        prodSearchWrap: $("prodSearchWrap"),

        overview: $("overviewView"),
        inspector: $("inspectorView"),
        propertiesView: $("propertiesView"),
        otherSideView: $("otherSideView"),
        gatherGrid: $("gatherGrid"),
        heroStatus: $("heroStatus"),
        heroHint: $("heroHint"),
        nextTechCard: $("nextTechCard"),
        flowCard: $("flowCard"),
        checklistCard: $("checklistCard"),

        sidePanel: $("sidePanel"),
        sideTabs: $("sideTabs"),
        sideContent: $("sideContent"),

        crystalCount: $("crystalCount"),
        boostBtn: $("boostBtn"),
        boostLabel: $("boostLabel"),
        clickBoostBtn: $("clickBoostBtn"),
        clickBoostLabel: $("clickBoostLabel"),
        saveState: $("saveState"),
        saveText: $("saveText"),
        saveBtn: $("saveBtn"),
        settingsBtn: $("settingsBtn"),
        shiftNumber: $("shiftNumber"),
        mobileNav: $("mobileNav"),

        techDialog: $("techDialog"),
        settingsDialog: $("settingsDialog"),
        exportDialog: $("exportDialog"),
        importDialog: $("importDialog"),
        offlineDialog: $("offlineDialog"),
        victoryDialog: $("victoryDialog"),

        toasts: $("toasts")
      };

      this.prodTree = new window.COR.ProductionTree(game, {
        onSelect: id => this.selectItem(id, { fromTree: true })
      });
      this.techGraph = new window.COR.TechGraph(game, {
        onResearch: id => this.doResearch(id)
      });
    }

    init() {
      this.bind();
      this.applySettings();
      if (!this.game.history.length) this.game.pushHistory();
      this.renderAll();
      this.setMobileView(window.innerWidth <= 980 ? "side" : "tree");
      this.updateSaveState("normal", "Сохранено " + U.formatClock(this.game.lastSave));
      this.drainEvents();
    }

    /* ── Служебное ─────────────────────────────────────── */
    techStatus(t) {
      if (this.game.techs.includes(t.id)) return "researched";
      if (this.game.canResearch(t.id).ok) return "available";
      const reqMet = (t.requires || []).every(id => this.game.techs.includes(id));
      return reqMet ? "open" : "locked";
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

    knownIds() {
      return Object.keys(D.ITEMS).filter(id => this.game.isKnown(id));
    }

    kindLabel(kind) { return KIND_LABEL[kind] || "Предмет"; }

    costChips(cost, extraClass) {
      const entries = Object.entries(cost || {});
      if (!entries.length) return `<span class="cost-chip ok">бесплатно</span>`;
      return entries.map(([id, qty]) => {
        const item = D.ITEMS[id];
        const have = this.game.items[id] || 0;
        const ok = have + 1e-9 >= qty;
        return `<span class="cost-chip ${ok ? "ok" : "miss"} ${extraClass || ""}" data-cost-item="${id}" data-cost-need="${qty}" title="${U.escapeHtml(item.name)}: нужно ${U.fmt(qty)}, есть ${U.fmt(have)}">
          <span class="c-ico" aria-hidden="true">${item.icon}</span>${U.fmt(qty)}
        </span>`;
      }).join("");
    }

    itemChips(obj, mode) {
      const entries = Object.entries(obj || {});
      if (!entries.length) return `<span class="item-chip">—</span>`;
      return entries.map(([id, qty]) => {
        const item = D.ITEMS[id];
        const have = this.game.items[id] || 0;
        const miss = mode !== "out" && have + 1e-9 < qty;
        return `<span class="item-chip ${mode === "out" ? "out" : ""} ${miss ? "miss" : ""}" title="${U.escapeHtml(item.name)}: ${mode === "out" ? "выход" : "нужно"} ${U.fmt(qty)}, есть ${U.fmt(have)}">
          <span class="ico" aria-hidden="true">${item.icon}</span><span>${U.escapeHtml(item.name)}</span><span class="qty">×${U.fmt(qty)}</span>
        </span>`;
      }).join("");
    }

    compactChips(obj) {
      return Object.entries(obj || {}).map(([id, qty]) => {
        const item = D.ITEMS[id];
        return `<span class="item-chip" title="${U.escapeHtml(item.name)} ×${U.fmt(qty)}"><span class="ico" aria-hidden="true">${item.icon}</span>${U.fmt(qty)}</span>`;
      }).join("");
    }

    formatCost(cost) {
      const parts = Object.entries(cost || {}).map(([id, qty]) => {
        const item = D.ITEMS[id];
        return `${item.icon} ${item.name} ×${U.fmt(qty)}`;
      });
      return parts.join(", ") || "ничего";
    }

    shiftNumber() {
      const days = Math.floor((Date.now() - this.game.createdAt) / 86400000);
      return String(days + 1).padStart(2, "0");
    }

    /* ── События ───────────────────────────────────────── */
    bind() {
      this.dom.prodSearch.addEventListener("input", () => this.onProdSearchInput());
      this.dom.prodSearch.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { this.closeProdSearch(); return; }
        if (!this.searchMatches.length) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.searchActive = (this.searchActive + 1) % this.searchMatches.length;
          this.paintSearchActive();
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this.searchActive = (this.searchActive - 1 + this.searchMatches.length) % this.searchMatches.length;
          this.paintSearchActive();
        } else if (e.key === "Enter") {
          e.preventDefault();
          const pick = this.searchMatches[this.searchActive >= 0 ? this.searchActive : 0];
          if (pick) this.chooseSearchResult(pick);
        }
      });
      this.dom.clearProdSearch.addEventListener("click", () => {
        this.dom.prodSearch.value = "";
        this.dom.clearProdSearch.hidden = true;
        this.closeProdSearch();
        this.dom.prodSearch.focus();
      });
      this.dom.prodSearchResults.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-search-item]");
        if (!btn) return;
        const id = btn.dataset.searchItem;
        this.chooseSearchResult(id);
      });
      document.addEventListener("click", (e) => {
        if (this.dom.prodSearchWrap && !this.dom.prodSearchWrap.contains(e.target)) this.closeProdSearch();
      });

      this.dom.sideTabs.addEventListener("click", (e) => {
        const tab = e.target.closest("[data-side-tab]");
        if (!tab) return;
        this.sideTab = tab.dataset.sideTab;
        this.dom.sideContent.scrollTop = 0;
        this.renderSide();
      });

      this.dom.sideContent.addEventListener("click", (e) => {
        const el = e.target.closest("[data-action]");
        if (el) this.handleAction(el, e);
      });

      this.dom.sideContent.addEventListener("input", (e) => {
        if (e.target.id === "sideRecipeSearch") {
          this.recipeSearch = e.target.value;
          this.applyRecipeFilter();
        }
      });
      this.dom.sideContent.addEventListener("change", (e) => {
        if (e.target.id === "sideRecipeMachine") {
          this.recipeMachine = e.target.value;
          this.applyRecipeFilter();
        }
      });
      this.dom.sideContent.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const el = e.target.closest("[data-action]");
        if (!el || el.tagName === "BUTTON") return;
        e.preventDefault();
        this.handleAction(el, e);
      });

      this.dom.boostBtn.addEventListener("click", () => this.buyBoost());
      this.dom.clickBoostBtn.addEventListener("click", () => this.buyClickBoost());
      this.dom.saveBtn.addEventListener("click", () => this.save(false));
      this.dom.settingsBtn.addEventListener("click", () => this.openSettings());
      $("victoryClose").addEventListener("click", () => this.dom.victoryDialog.close());

      this.dom.mobileNav.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-mobile-view]");
        if (!btn) return;
        this.setMobileView(btn.dataset.mobileView);
      });

      this.dom.settingsDialog.addEventListener("change", (e) => {
        if (e.target.id === "settingSound") {
          this.game.settings.sound = e.target.checked;
          this.sound.enabled = e.target.checked;
          if (e.target.checked) this.sound.play("click");
          this.save(true);
        }
        if (e.target.id === "settingParticles") {
          this.game.settings.particles = e.target.checked;
          if (this.ambient) this.ambient.setEnabled(e.target.checked);
          this.save(true);
        }
      });

      $("saveNowBtn").addEventListener("click", () => this.save(false));
      $("exportBtn").addEventListener("click", () => this.openExport());
      $("importBtn").addEventListener("click", () => this.openImport());
      $("resetBtn").addEventListener("click", () => this.resetProgress());

      $("copyExportBtn").addEventListener("click", () => {
        const ta = $("exportText");
        ta.focus();
        ta.select();
        U.copyText(ta.value).then(ok => {
          this.toast({ icon: ok ? "📋" : "⚠️", title: ok ? "Скопировано" : "Не удалось скопировать", text: ok ? "JSON сейва в буфере обмена." : "Выделите текст и скопируйте вручную.", type: ok ? "info" : "error" });
        });
      });
      $("downloadExportBtn").addEventListener("click", () => {
        const ok = U.downloadText("cycle-resources-save.json", $("exportText").value);
        this.toast({ icon: ok ? "💾" : "⚠️", title: ok ? "Файл сохранён" : "Скачивание не удалось", text: ok ? "cycle-resources-save.json" : "Скопируйте JSON вручную.", type: ok ? "info" : "error" });
      });

      $("importFile").addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          $("importText").value = String(reader.result || "");
          $("importError").hidden = true;
        };
        reader.onerror = () => this.setImportError("Не удалось прочитать файл.");
        reader.readAsText(file);
      });
      $("clearImportBtn").addEventListener("click", () => {
        $("importText").value = "";
        $("importFile").value = "";
        $("importError").hidden = true;
      });
      $("loadImportBtn").addEventListener("click", () => this.loadImport());

      $("offlineClose").addEventListener("click", () => this.dom.offlineDialog.close());

      document.addEventListener("click", (e) => {
        const close = e.target.closest("[data-dialog-close]");
        if (close) {
          const dlg = close.closest("dialog");
          if (dlg) dlg.close();
        }
      });
      document.querySelectorAll("dialog.modal").forEach(dlg => {
        dlg.addEventListener("click", (e) => {
          if (e.target === dlg) dlg.close();
        });
      });

      document.addEventListener("pointerdown", () => this.sound.resume(), { once: true });
    }

    handleAction(el, e) {
      const action = el.dataset.action;
      if (action === "gather") this.doGather(el.dataset.item, el);
      else if (action === "back") this.selectItem(null);
      else if (action === "craft") this.doCraft(el.dataset.recipe, el);
      else if (action === "build") this.doBuild(el.dataset.recipe, Number(el.dataset.count) || 1, el);
      else if (action === "remove") this.doRemove(el.dataset.recipe, Number(el.dataset.count) || 1);
      else if (action === "select-item") this.selectItem(el.dataset.id);
      else if (action === "open-tech") this.openTech(el.dataset.tech || null);
      else if (action === "research") this.doResearch(el.dataset.tech);
    }

    /* ── Отрисовка: общее ──────────────────────────────── */
    renderAll() {
      this.prodTree.rebuild(true);
      this.renderProperties();
      this.renderSide();
      this.updateHUD();
      this.updateBadges();
      this.updateSaveInfo();
      this.techGraph.refresh();
    }

    renderProperties() {
      const id = this.game.selectedItem;
      const has = !!(id && D.ITEMS[id] && this.game.isKnown(id));
      this.dom.overview.hidden = has;
      this.dom.inspector.hidden = !has;
      this.renderOverview();
      if (has) this.renderInspector();
      if (this.prodTree) this.prodTree.setSelected(has ? id : null);
    }

    /* Оставлено для старых внутренних вызовов: панель теперь одна — свойства. */
    renderCenter() {
      this.renderProperties();
    }

    selectItem(id, opts) {
      if (id && !this.game.isKnown(id)) return;
      this.game.selectedItem = id || null;
      this.sideTab = "properties";
      this.renderProperties();
      this.renderSide();
      if (this.prodTree) this.prodTree.setSelected(this.game.selectedItem);
      this.dom.sideContent.scrollTop = 0;
      if (id) {
        if (opts && opts.fromSearch) {
          if (window.innerWidth <= 980) this.setMobileView("tree");
        } else if (window.innerWidth <= 980) {
          this.setMobileView("side");
        }
      }
      this.updateInspectorLive();
      this.updateBadges();
    }

    updateSelection() {
      if (this.prodTree) this.prodTree.setSelected(this.game.selectedItem);
    }

    /* ── Склад ─────────────────────────────────────────── */
    renderInventory(force) {
      const known = this.knownIds();
      const sig = `${this.invTab}|${this.invSearch}|${known.join(",")}|${this.game.techs.length}`;
      if (!force && sig === this.invSignature) return;
      this.invSignature = sig;

      const counts = { raw: 0, ingot: 0, material: 0, part: 0 };
      known.forEach(id => { const k = D.ITEMS[id].kind; counts[k] = (counts[k] || 0) + 1; });
      this.dom.invKnownCount.textContent = U.fmtInt(known.length);
      this.dom.invTabs.querySelectorAll("[data-tab-count]").forEach(el => {
        el.textContent = counts[el.dataset.tabCount] || 0;
      });
      this.dom.invTabs.querySelectorAll("[data-inv-tab]").forEach(el => {
        const on = el.dataset.invTab === this.invTab;
        el.classList.toggle("active", on);
        el.setAttribute("aria-selected", on ? "true" : "false");
      });

      const q = this.invSearch.toLowerCase();
      const items = known.filter(id => {
        const item = D.ITEMS[id];
        if (item.kind !== this.invTab) return false;
        if (!q) return true;
        return item.name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
      });

      if (!items.length) {
        this.dom.invGrid.innerHTML = "";
        this.dom.invGrid.hidden = true;
        this.dom.invEmpty.hidden = false;
        this.dom.invEmpty.innerHTML = q
          ? `<span class="empty-icon" aria-hidden="true">🔎</span><p>Ничего не найдено.</p><span>Попробуйте другое название или очистите поиск.</span>`
          : `<span class="empty-icon" aria-hidden="true">🕳️</span><p>Здесь пока пусто.</p><span>Добудьте сырьё на пульте или откройте новые технологии.</span>`;
        return;
      }

      this.dom.invGrid.hidden = false;
      this.dom.invEmpty.hidden = true;
      this.dom.invGrid.innerHTML = items.map(id => {
        const item = D.ITEMS[id];
        const qty = this.game.items[id] || 0;
        const gatherable = this.game.isGatherable(id);
        const rate = this.invRate(id);
        return `<button class="inv-cell ${this.game.selectedItem === id ? "selected" : ""}" type="button" data-item="${id}" aria-label="${U.escapeHtml(item.name)}: ${U.fmt(qty)} на складе">
          <span class="inv-cell-top">
            <span class="inv-icon" aria-hidden="true">${item.icon}</span>
            ${gatherable ? `<span class="inv-flag">ручная</span>` : ""}
          </span>
          <span class="inv-name">${U.escapeHtml(item.name)}</span>
          <span class="inv-qty js-qty">${U.fmt(qty)}</span>
          <span class="inv-rate js-rate ${rate.cls}">${rate.text}</span>
        </button>`;
      }).join("");

      this.updateInventoryLive();
    }

    invRate(id) {
      const s = this.game.getItemStats(id);
      if (Math.abs(s.balance) > 0.0005) {
        return {
          text: `${U.fmtSigned(s.balance)}/с`,
          cls: s.balance > 0 ? "good" : "bad"
        };
      }
      if (s.manual > 0) {
        return { text: `клик +${U.fmt(s.manual)}`, cls: "" };
      }
      return { text: "", cls: "" };
    }

    updateInventoryLive() {
      const cells = this.dom.invGrid.querySelectorAll("[data-item]");
      cells.forEach(cell => {
        const id = cell.dataset.item;
        const qtyEl = cell.querySelector(".js-qty");
        const rateEl = cell.querySelector(".js-rate");
        if (qtyEl) qtyEl.textContent = U.fmt(this.game.items[id] || 0);
        if (rateEl) {
          const rate = this.invRate(id);
          rateEl.textContent = rate.text;
          rateEl.className = "inv-rate js-rate " + rate.cls;
        }
      });
    }

    /* ── Обзор ─────────────────────────────────────────── */
    renderOverview() {
      this.renderGatherGrid();
      this.renderNextTech();
      this.renderFlow();
      this.renderChecklist();
      this.updateHeroStatus();
    }

    renderGatherGrid() {
      const ids = Object.keys(D.ITEMS).filter(id => this.game.isGatherable(id));
      if (!ids.length) {
        this.dom.gatherGrid.innerHTML = `<div class="empty-note">Ручная добыча пока закрыта. Исследуйте первую жилу в дереве технологий.</div>`;
        return;
      }
      this.dom.gatherGrid.innerHTML = ids.map(id => {
        const item = D.ITEMS[id];
        const gain = item.gather * this.game.effects.clickMult;
        return `<button class="gather-btn" type="button" data-action="gather" data-item="${id}" aria-label="Добыть ${U.escapeHtml(item.name)}, плюс ${U.fmt(gain)} за клик">
          <span class="g-icon" aria-hidden="true">${item.icon}</span>
          <span class="g-copy">
            <span class="g-name">${U.escapeHtml(item.name)}</span>
            <span class="g-qty js-gather-qty" data-item="${id}">${U.fmt(this.game.items[id] || 0)}</span>
          </span>
          <span class="g-plus">+${U.fmt(gain)}</span>
        </button>`;
      }).join("");
      this.updateHeroHint();
    }

    updateGatherButtons() {
      this.dom.gatherGrid.querySelectorAll(".js-gather-qty").forEach(el => {
        el.textContent = U.fmt(this.game.items[el.dataset.item] || 0);
      });
    }

    updateHeroStatus() {
      const session = Math.max(0, (Date.now() - this.game.stats.sessionStart) / 1000);
      this.dom.heroStatus.textContent = `Смена ${this.shiftNumber()} · ${U.formatDuration(session, true)}`;
      this.dom.shiftNumber.textContent = this.shiftNumber();
    }

    updateHeroHint() {
      const ids = Object.keys(D.ITEMS).filter(id => this.game.isGatherable(id));
      if (!ids.length) {
        this.dom.heroHint.textContent = "Откройте первую жилу в дереве технологий.";
        return;
      }
      const gain = ids[0].gather * this.game.effects.clickMult;
      const pick = this.game.effects.clickMult > 1 ? "Кирка++ активна" : "Ручная добыча";
      this.dom.heroHint.textContent = `${pick}: +${U.fmt(gain)} за клик · открыто ${ids.length} ${U.plural(ids.length, "жила", "жилы", "жил")}.`;
    }

    renderNextTech() {
      const next = this.game.getNextTech();
      if (!next) {
        this.dom.nextTechCard.innerHTML = `<div class="card-head"><span class="card-title">Следующее исследование</span><span class="card-meta">финал</span></div>
          <div class="empty-note">Все ${D.TECH.length} технологий исследованы. Завод вышел на квантовый предел — дальше только миллионы на складе.</div>`;
        return;
      }
      const status = this.techStatus(next);
      const cost = this.game.getTechCost(next.id);
      const ratio = this.costRatio(next);
      const reqMet = (next.requires || []).every(id => this.game.techs.includes(id));
      const statusText = status === "available" ? "Можно исследовать сейчас"
        : status === "open" ? "Нужно накопить ресурсы"
          : "Сначала завершите зависимости";
      const missingTechs = (next.requires || []).filter(id => !this.game.techs.includes(id)).map(id => D.TECH_BY_ID[id].title);

      this.dom.nextTechCard.innerHTML = `
        <div class="card-head">
          <span class="card-title">Следующее исследование</span>
          <span class="card-meta">уровень ${next.tier}</span>
        </div>
        <div class="tech-preview">
          <div class="tech-preview-icon" aria-hidden="true">${next.icon}</div>
          <div class="tech-preview-copy">
            <strong>${U.escapeHtml(next.title)}</strong>
            <small>${statusText}${status === "locked" && missingTechs.length ? `: ${U.escapeHtml(missingTechs.join(", "))}` : ""}</small>
          </div>
        </div>
        <div class="cost-row">${this.costChips(next.cost)}</div>
        <div class="progress" style="margin-top:9px"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>
        <div class="button-row" style="margin-top:10px">
          <button class="btn primary small" type="button" data-action="research" data-tech="${next.id}" ${status === "available" ? "" : "disabled"}>Изучить</button>
          <button class="btn ghost small" type="button" data-action="open-tech" data-tech="${next.id}">Открыть дерево</button>
        </div>
        <p class="hint">${reqMet ? "Стоимость списывается со склада один раз." : "Сначала откройте предыдущие узлы дерева."}</p>`;
    }

    renderFlow() {
      const known = this.knownIds();
      const list = known.map(id => {
        const s = this.game.getItemStats(id);
        return { id, qty: this.game.items[id] || 0, s };
      }).filter(x => x.qty > 0.01 || Math.abs(x.s.actual.prod) > 0.001 || Math.abs(x.s.actual.cons) > 0.001)
        .sort((a, b) => (b.s.actual.prod + b.s.actual.cons) - (a.s.actual.prod + a.s.actual.cons) || b.qty - a.qty)
        .slice(0, 6);

      if (!list.length) {
        this.dom.flowCard.innerHTML = `<div class="card-head"><span class="card-title">Ключевые потоки</span><span class="card-meta">склад · баланс</span></div>
          <div class="empty-note">Пока пусто. Добудьте руду — и здесь появятся первые потоки.</div>`;
        return;
      }

      this.dom.flowCard.innerHTML = `
        <div class="card-head"><span class="card-title">Ключевые потоки</span><span class="card-meta">склад · баланс</span></div>
        <div class="flow-list">${list.map(x => {
          const item = D.ITEMS[x.id];
          const bal = x.s.balance;
          const cls = Math.abs(bal) < 0.0005 ? "zero" : bal > 0 ? "good" : "bad";
          const txt = Math.abs(bal) < 0.0005 ? "—" : `${U.fmtSigned(bal)}/с`;
          return `<button class="flow-row" type="button" data-action="select-item" data-id="${x.id}" aria-label="Открыть ${U.escapeHtml(item.name)}">
            <span class="flow-ico" aria-hidden="true">${item.icon}</span>
            <span class="flow-name">${U.escapeHtml(item.name)}</span>
            <span class="flow-qty">${U.fmt(x.qty)}</span>
            <span class="flow-rate ${cls}">${txt}</span>
          </button>`;
        }).join("")}</div>`;
    }

    renderChecklist() {
      const steps = [
        {
          label: "Сделайте 10 ручных ударов",
          value: this.game.stats.manualGathered,
          goal: 10
        },
        {
          label: "Скрафьте 10 предметов вручную",
          value: this.game.stats.manualCrafts,
          goal: 10
        },
        {
          label: "Исследуйте «Первый металл»",
          value: this.game.techs.includes("t1_metal") ? 1 : 0,
          goal: 1
        },
        {
          label: "Постройте плавильню",
          value: Math.min(1, this.game.ownedOfType("smelter")),
          goal: 1
        }
      ];
      const done = steps.filter(s => s.value >= s.goal).length;
      const all = done === steps.length;

      if (all) {
        const next = this.game.getNextTech();
        this.dom.checklistCard.innerHTML = `<div class="card-head"><span class="card-title">Первый запуск</span><span class="card-meta">${done} / ${steps.length}</span></div>
          <div class="empty-note" style="border-color:rgba(110,211,154,.22);color:var(--muted)">
            <strong style="color:var(--good)">Завод запущен.</strong><br>
            Плавильня работает, склад пополняется. ${next ? `Следующая цель — «${U.escapeHtml(next.title)}».` : "Все технологии уже открыты."}
            <div class="button-row"><button class="btn primary small" type="button" data-action="open-tech" ${next ? `data-tech="${next.id}"` : ""}>Открыть дерево</button></div>
          </div>`;
        return;
      }

      this.dom.checklistCard.innerHTML = `
        <div class="card-head"><span class="card-title">Первый запуск</span><span class="card-meta">${done} / ${steps.length}</span></div>
        <div class="checklist">${steps.map((s, i) => {
          const ok = s.value >= s.goal;
          const progress = `${Math.min(s.value, s.goal).toFixed(s.goal > 10 ? 0 : 0)} / ${s.goal}`;
          return `<div class="check-item ${ok ? "done" : ""}">
            <span class="check-mark" aria-hidden="true">${ok ? "✓" : i + 1}</span>
            <span class="check-text">${U.escapeHtml(s.label)}</span>
            <span class="check-progress">${ok ? "готово" : progress}</span>
          </div>`;
        }).join("")}</div>`;
    }

    /* ── Инспектор ─────────────────────────────────────── */
    renderInspector() {
      const id = this.game.selectedItem;
      const item = D.ITEMS[id];
      if (!item) { this.game.selectedItem = null; this.renderCenter(); return; }
      const qty = this.game.items[id] || 0;
      const stats = this.game.getItemStats(id);
      const recipes = this.game.getItemRecipes(id);
      const uses = this.game.getItemUses(id);
      const techUses = this.game.getTechsUsingItem(id);
      const gatherable = this.game.isGatherable(id);

      const useMap = new Map();
      for (const r of uses) {
        const out = this.game.getPrimaryOutput(r);
        if (!out || !D.ITEMS[out]) continue;
        if (!useMap.has(out)) useMap.set(out, { out, qty: r.inputs[id] || 0, rid: r.id });
      }
      const useList = Array.from(useMap.values());

      this.dom.inspector.innerHTML = `
        <button class="insp-back" type="button" data-action="back" aria-label="Вернуться к обзору">← Обзор</button>
        <header class="insp-head">
          <div class="insp-icon" aria-hidden="true">${item.icon}</div>
          <div class="insp-copy">
            <span class="insp-kind">${this.kindLabel(item.kind)}${gatherable ? " · ручная добыча" : ""}</span>
            <h2 class="insp-title">${U.escapeHtml(item.name)}</h2>
            <p class="insp-desc">${U.escapeHtml(item.desc || "Материал производственной цепочки.")}</p>
          </div>
          <div class="insp-total">
            <span class="label">На складе</span>
            <span class="value" id="inspQty">${U.fmt(qty)}</span>
          </div>
        </header>

        <div class="section-title">Производство <span>${recipes.length ? recipes.length + " " + U.plural(recipes.length, "рецепт", "рецепта", "рецептов") : "нет автоматических линий"}</span></div>
        <div class="prod-card">
          <div class="prod-grid">
            <div class="prod-cell">
              <span class="prod-label">Выпуск авто</span>
              <span class="prod-value good" id="inspProd">${stats.actual.prod > 0.0005 ? "+" + U.fmt(stats.actual.prod) + "/с" : "0/с"}</span>
              <span class="prod-sub">номинал ${stats.nominal.prod > 0.0005 ? "+" + U.fmt(stats.nominal.prod) + "/с" : "0/с"}</span>
            </div>
            <div class="prod-cell">
              <span class="prod-label">Расход</span>
              <span class="prod-value ${stats.actual.cons > 0.0005 ? "bad" : "neutral"}" id="inspCons">${stats.actual.cons > 0.0005 ? "−" + U.fmt(stats.actual.cons) + "/с" : "0/с"}</span>
              <span class="prod-sub">спрос ${stats.nominal.cons > 0.0005 ? "−" + U.fmt(stats.nominal.cons) + "/с" : "0/с"}</span>
            </div>
            <div class="prod-cell">
              <span class="prod-label">Баланс</span>
              <span class="prod-value ${Math.abs(stats.balance) < 0.0005 ? "neutral" : stats.balance > 0 ? "good" : "bad"}" id="inspBalance">${Math.abs(stats.balance) < 0.0005 ? "0/с" : U.fmtSigned(stats.balance) + "/с"}</span>
              <span class="prod-sub">${gatherable ? "ручная +" + U.fmt(stats.manual) + "/клик" : "авто + клик"}</span>
            </div>
          </div>
          <p class="prod-note" id="inspNote">${this.inspectorNote(stats, item, qty)}</p>
          ${gatherable ? `<div class="manual-strip">
            <span class="m-copy">Ручная добыча: <strong>+${U.fmt(stats.manual)}</strong> за клик</span>
            <button class="btn primary small" type="button" data-action="gather" data-item="${id}">Добыть +${U.fmt(stats.manual)}</button>
          </div>` : ""}
        </div>

        <div class="section-title">Рецепты <span>${recipes.length ? recipes.length : "0"}</span></div>
        <div class="recipe-list">${recipes.length ? recipes.map(r => this.recipeCardHTML(r, id)).join("") : `<div class="empty-note">${gatherable ? "Это сырьё добывается вручную или шахтёрским комплексом." : "Рецепт пока не исследован. Загляните в дерево технологий."}</div>`}</div>

        <div class="section-title">Где используется <span>${useList.length ? useList.length : "пока нигде"}</span></div>
        ${useList.length ? `<div class="use-grid">${useList.slice(0, 24).map(u => {
          const oi = D.ITEMS[u.out];
          return `<button class="use-chip" type="button" data-action="select-item" data-id="${u.out}" title="Открыть ${U.escapeHtml(oi.name)}">
            <span class="ico" aria-hidden="true">${oi.icon}</span>${U.escapeHtml(oi.name)}<span class="qty">×${U.fmt(u.qty)}</span>
          </button>`;
        }).join("")}${useList.length > 24 ? `<span class="use-chip">+${useList.length - 24} ещё</span>` : ""}</div>` : `<div class="empty-note">Этот предмет пока не входит в открытые рецепты.</div>`}

        ${techUses.length ? `<div class="section-title">В исследованиях <span>${techUses.length}</span></div>
        <div class="use-grid">${techUses.map(t => {
          const st = this.techStatus(t);
          return `<button class="use-chip" type="button" data-action="open-tech" data-tech="${t.id}" title="${U.escapeHtml(t.title)} · ${STATUS_LABEL[st]}">
            <span class="ico" aria-hidden="true">${t.icon}</span>${U.escapeHtml(t.title)}<span class="qty">×${U.fmt(t.cost[id])}</span>
          </button>`;
        }).join("")}</div>` : ""}
      `;
      this.updateInspectorLive();
    }

    inspectorNote(stats, item, qty) {
      const bits = [];
      if (stats.nominal.prod > 0.001 && stats.utilization < 0.95) {
        bits.push(`<span class="warn">Линии загружены на ${Math.round(stats.utilization * 100)}%: не хватает сырья.</span>`);
      }
      if (stats.actual.cons > stats.actual.prod + 0.001) {
        bits.push(`Расход выше выпуска на ${U.fmt(stats.actual.cons - stats.actual.prod)}/с.`);
        if (qty > 0) bits.push(`Запаса хватит на ${U.formatDuration(qty / (stats.actual.cons - stats.actual.prod))}.`);
      } else if (stats.actual.prod > stats.actual.cons + 0.001) {
        bits.push(`Запас растёт на ${U.fmt(stats.actual.prod - stats.actual.cons)}/с.`);
      }
      if (!stats.nominal.prod && !stats.nominal.cons && !item.gather && !this.game.getItemRecipes(this.game.selectedItem).length) {
        bits.push("Источник ещё не открыт.");
      }
      if (item.gather) {
        bits.push(`Ручная добыча: +${U.fmt(stats.manual)} за клик.`);
      }
      if (!bits.length) bits.push("Линии не запущены. Постройте здание или скрафтите предмет вручную.");
      return bits.join(" ");
    }

    recipeCardHTML(r, itemId) {
      const machine = D.MACHINES[r.machine];
      const line = this.game.getLineInfo(r.id);
      const primary = this.game.getPrimaryOutput(r);
      const cost = this.game.machineCost(r.machine);
      const canBuild = this.game.canAfford(cost) && this.game.unlocked.machines.has(r.machine);
      const manualCan = this.game.canAfford(r.inputs || {});
      const count = this.game.lines[r.id] || 0;
      const rate = line && line.count > 0
        ? `${U.fmtRate(line.outputs[primary] || 0)}/с · загрузка ${Math.round((line.utilization || 0) * 100)}%`
        : "линия не построена";

      return `<div class="recipe-card" data-recipe-card="${r.id}">
        <div class="recipe-head">
          <span class="recipe-machine"><span class="ico" aria-hidden="true">${machine.icon}</span>${U.escapeHtml(machine.name)}</span>
          <span class="recipe-time">${U.fmt(r.time)} с / цикл</span>
        </div>
        <div class="recipe-flow">
          <div class="recipe-side">${this.itemChips(r.inputs, "in")}</div>
          <span class="recipe-arrow" aria-hidden="true">→</span>
          <div class="recipe-side">${this.itemChips(r.outputs, "out")}</div>
        </div>
        <div class="recipe-foot">
          <span class="recipe-rate js-recipe-rate"><strong>${rate}</strong></span>
          <div class="recipe-controls" aria-label="Количество зданий">
            <button class="mini-btn" type="button" data-action="remove" data-recipe="${r.id}" data-count="1" aria-label="Убрать одно здание" ${count ? "" : "disabled"}>−</button>
            <span class="counter ${count ? "" : "zero"}">${count}</span>
            <button class="mini-btn" type="button" data-action="build" data-recipe="${r.id}" data-count="1" aria-label="Построить одно здание" ${canBuild ? "" : "disabled"}>+</button>
            <button class="mini-btn x5" type="button" data-action="build" data-recipe="${r.id}" data-count="5" aria-label="Построить пять зданий" ${canBuild ? "" : "disabled"}>×5</button>
          </div>
        </div>
        <div class="cost-line">
          <span class="lbl">Постройка</span>
          ${this.costChips(cost)}
          ${r.manual ? `<button class="btn small manual-craft" type="button" data-action="craft" data-recipe="${r.id}" ${manualCan ? "" : "disabled"} title="Мгновенно выполнить один цикл вручную">Скрафтить</button>` : ""}
        </div>
      </div>`;
    }

    updateInspectorLive() {
      const id = this.game.selectedItem;
      if (!id || !D.ITEMS[id] || this.dom.inspector.hidden) return;
      const item = D.ITEMS[id];
      const stats = this.game.getItemStats(id);
      const qty = this.game.items[id] || 0;

      const qtyEl = $("inspQty");
      if (qtyEl) qtyEl.textContent = U.fmt(qty);
      const prod = $("inspProd");
      if (prod) {
        prod.textContent = stats.actual.prod > 0.0005 ? "+" + U.fmt(stats.actual.prod) + "/с" : "0/с";
        prod.className = "prod-value " + (stats.actual.prod > 0.0005 ? "good" : "neutral");
      }
      const cons = $("inspCons");
      if (cons) {
        cons.textContent = stats.actual.cons > 0.0005 ? "−" + U.fmt(stats.actual.cons) + "/с" : "0/с";
        cons.className = "prod-value " + (stats.actual.cons > 0.0005 ? "bad" : "neutral");
      }
      const bal = $("inspBalance");
      if (bal) {
        bal.textContent = Math.abs(stats.balance) < 0.0005 ? "0/с" : U.fmtSigned(stats.balance) + "/с";
        bal.className = "prod-value " + (Math.abs(stats.balance) < 0.0005 ? "neutral" : stats.balance > 0 ? "good" : "bad");
      }
      const note = $("inspNote");
      if (note) note.innerHTML = this.inspectorNote(stats, item, qty);

      this.dom.inspector.querySelectorAll("[data-recipe-card]").forEach(card => {
        const rid = card.dataset.recipeCard;
        const recipe = this.game.getRecipe(rid);
        if (!recipe) return;
        const line = this.game.getLineInfo(rid);
        const primary = this.game.getPrimaryOutput(recipe);
        const rateEl = card.querySelector(".js-recipe-rate");
        if (rateEl) {
          const rate = line && line.count > 0
            ? `${U.fmtRate(line.outputs[primary] || 0)}/с · ${Math.round((line.utilization || 0) * 100)}%`
            : "линия не построена";
          rateEl.innerHTML = `<strong>${rate}</strong>`;
        }
        const cost = this.game.machineCost(recipe.machine);
        const canBuild = this.game.canAfford(cost) && this.game.unlocked.machines.has(recipe.machine);
        card.querySelectorAll('[data-action="build"]').forEach(btn => { btn.disabled = !canBuild; });
        const manualBtn = card.querySelector('[data-action="craft"]');
        if (manualBtn) manualBtn.disabled = !this.game.canAfford(recipe.inputs || {});
        card.querySelectorAll("[data-cost-item]").forEach(chip => {
          const need = Number(chip.dataset.costNeed || 0);
          const have = this.game.items[chip.dataset.costItem] || 0;
          chip.classList.toggle("ok", have + 1e-9 >= need);
          chip.classList.toggle("miss", have + 1e-9 < need);
        });
      });
    }

    /* ── Правая панель ─────────────────────────────────── */
    renderSide() {
      this.dom.sideTabs.querySelectorAll("[data-side-tab]").forEach(el => {
        const on = el.dataset.sideTab === this.sideTab;
        el.classList.toggle("active", on);
        el.setAttribute("aria-selected", on ? "true" : "false");
      });
      const isProperties = this.sideTab === "properties";
      this.dom.propertiesView.hidden = !isProperties;
      this.dom.otherSideView.hidden = isProperties;
      const scroll = this.dom.sideContent.scrollTop;

      if (isProperties) {
        this.renderProperties();
      } else {
        if (this.sideTab === "tree") this.dom.otherSideView.innerHTML = this.treeSideHTML();
        else if (this.sideTab === "buildings") this.dom.otherSideView.innerHTML = this.buildingsSideHTML();
        else if (this.sideTab === "recipes") this.dom.otherSideView.innerHTML = this.recipesSideHTML();
        else this.dom.otherSideView.innerHTML = this.statsSideHTML();
        this.dom.sideContent.scrollTop = scroll;
        if (this.sideTab === "recipes") this.applyRecipeFilter();
        if (this.sideTab === "stats") requestAnimationFrame(() => this.drawHistoryChart());
      }

      const panelVisible = window.innerWidth > 980 || this.mobileView === "side";
      if (panelVisible && this.sideTab === "recipes") this.game.markRecipesSeen();
      if (panelVisible && this.sideTab === "stats") this.game.markAchievementsSeen();
      this.updateBadges();
    }

    treeSideHTML() {
      const total = D.TECH.length;
      const done = this.game.techs.length;
      const pct = total ? (done / total) * 100 : 0;
      const available = this.game.getAvailableTechs();
      const byTier = new Map();
      for (const t of D.TECH) {
        if (!byTier.has(t.tier)) byTier.set(t.tier, []);
        byTier.get(t.tier).push(t);
      }
      const miniRows = Array.from({ length: 9 }, (_, i) => {
        const tier = i + 1;
        const list = byTier.get(tier) || [];
        return `<div class="mini-tier">
          <span class="mini-tier-label">L${tier}</span>
          <div class="mini-tier-line">${list.map(t => {
            const st = this.techStatus(t);
            return `<button class="mini-node ${st}" type="button" data-action="open-tech" data-tech="${t.id}" title="${U.escapeHtml(t.title)} · ${STATUS_LABEL[st]}" aria-label="${U.escapeHtml(t.title)}, ${STATUS_LABEL[st]}">${t.icon}</button>`;
          }).join("")}</div>
        </div>`;
      }).join("");

      const availHtml = available.length ? available.slice(0, 4).map(t => {
        const ratio = this.costRatio(t);
        return `<button class="avail-tech" type="button" data-action="open-tech" data-tech="${t.id}">
          <span class="a-ico" aria-hidden="true">${t.icon}</span>
          <span class="a-copy">
            <span class="a-title">${U.escapeHtml(t.title)}</span>
            <span class="a-meta">уровень ${t.tier} · ${t.crystals || 0} 💠</span>
            <span class="progress"><i style="width:${(ratio * 100).toFixed(1)}%"></i></span>
          </span>
          <span class="a-action">Изучить</span>
        </button>`;
      }).join("") : `<div class="empty-note">Доступных исследований нет. Накапливайте ресурсы или завершайте предыдущие узлы.</div>`;

      const nextLocked = D.TECH.filter(t => !this.game.techs.includes(t.id))
        .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))[0];

      return `<div class="side-section">
        <div class="side-head">Дерево развития <span class="meta">${done} / ${total}</span></div>
        <div class="side-card">
          <div class="progress"><i style="width:${pct.toFixed(1)}%"></i></div>
          <div class="tech-progress-line"><span class="num">${done ? "следующий уровень открыт" : "начните с первого металла"}</span><span class="num">${pct.toFixed(0)}%</span></div>
          <div class="mini-tree">${miniRows}</div>
          <button class="btn ghost wide" type="button" data-action="open-tech" style="margin-top:9px">Открыть полное дерево</button>
        </div>
      </div>
      <div class="side-section">
        <div class="side-head">Доступно сейчас <span class="meta">${available.length}</span></div>
        ${availHtml}
      </div>
      ${nextLocked && !available.length ? `<div class="side-section">
        <div class="side-head">Следующая цель <span class="meta">уровень ${nextLocked.tier}</span></div>
        <button class="avail-tech" type="button" data-action="open-tech" data-tech="${nextLocked.id}">
          <span class="a-ico" aria-hidden="true">${nextLocked.icon}</span>
          <span class="a-copy"><span class="a-title">${U.escapeHtml(nextLocked.title)}</span><span class="a-meta">${(nextLocked.requires || []).map(id => D.TECH_BY_ID[id].title).join(", ") || "базовая технология"}</span></span>
          <span class="a-action">Открыть</span>
        </button>
      </div>` : ""}`;
    }

    buildingsSideHTML() {
      const groups = this.game.getMachineGroups();
      const total = this.game.totalBuildings();
      const types = groups.length;
      const summary = `<div class="side-card"><div class="stat-grid">
        <div class="stat-tile"><span class="s-label">Всего зданий</span><span class="s-value">${U.fmtInt(total)}</span><span class="s-sub">на всех линиях</span></div>
        <div class="stat-tile"><span class="s-label">Типов машин</span><span class="s-value">${types}</span><span class="s-sub">из ${Object.keys(D.MACHINES).length}</span></div>
      </div></div>`;

      if (!groups.length) {
        return `${summary}<div class="side-section"><div class="empty-note">Пока нет ни одного здания. Откройте предмет на складе и нажмите «+» у рецепта — например, плавильню для железного слитка.</div></div>`;
      }

      const html = groups.map(g => `<div class="building-group">
        <div class="building-head">
          <span class="b-ico" aria-hidden="true">${g.machine.icon}</span>
          <span class="b-name">${U.escapeHtml(g.machine.name)}</span>
          <span class="b-count">${g.count}</span>
        </div>
        ${g.lines.map(line => {
          const primary = this.game.getPrimaryOutput(line.recipe);
          const item = D.ITEMS[primary];
          const rate = line.info ? (line.info.outputs[primary] || 0) : 0;
          const util = line.info ? Math.round((line.info.utilization || 0) * 100) : 0;
          return `<div class="line-row">
            <div class="line-main">
              <div class="line-title"><span class="ico" aria-hidden="true">${item.icon}</span>${U.escapeHtml(item.name)}</div>
              <div class="line-sub">${U.fmtRate(rate)}/с · ${util}% · ${line.count} ${U.plural(line.count, "здание", "здания", "зданий")}</div>
            </div>
            <div class="line-controls">
              <button class="mini-btn" type="button" data-action="remove" data-recipe="${line.rid}" data-count="1" aria-label="Убрать здание">−</button>
              <button class="mini-btn" type="button" data-action="build" data-recipe="${line.rid}" data-count="1" aria-label="Построить здание">+</button>
            </div>
          </div>`;
        }).join("")}
      </div>`).join("");

      return `${summary}<div class="side-section"><div class="side-head">Построенные линии <span class="meta">${total}</span></div>${html}</div>`;
    }

    recipesSideHTML() {
      const unlocked = D.RECIPES.filter(r => this.game.unlocked.recipes.has(r.id));
      const machines = Array.from(new Set(unlocked.map(r => r.machine)))
        .sort((a, b) => (D.MACHINES[a].order || 99) - (D.MACHINES[b].order || 99));
      if (this.recipeMachine !== "all" && !machines.includes(this.recipeMachine)) this.recipeMachine = "all";

      const options = [`<option value="all"${this.recipeMachine === "all" ? " selected" : ""}>Все машины</option>`]
        .concat(machines.map(m => `<option value="${m}"${this.recipeMachine === m ? " selected" : ""}>${U.escapeHtml(D.MACHINES[m].short || D.MACHINES[m].name)}</option>`))
        .join("");

      const cards = unlocked.map(r => {
        const primary = this.game.getPrimaryOutput(r);
        const item = D.ITEMS[primary];
        const machine = D.MACHINES[r.machine];
        const count = this.game.lines[r.id] || 0;
        const filter = [
          this.game.getRecipeTitle(r), machine.name, r.name,
          ...Object.keys(r.inputs || {}).map(id => D.ITEMS[id].name),
          ...Object.keys(r.outputs || {}).map(id => D.ITEMS[id].name)
        ].join(" ").toLowerCase();
        const visible = (!this.recipeSearch || filter.includes(this.recipeSearch.toLowerCase())) &&
          (this.recipeMachine === "all" || r.machine === this.recipeMachine);
        return `<div class="recipe-list-card ${visible ? "" : "hidden"}" role="button" tabindex="0" aria-label="Открыть предмет ${U.escapeHtml(item.name)}" data-action="select-item" data-id="${primary}" data-machine="${r.machine}" data-filter="${U.escapeHtml(filter)}">
          <div class="rl-head">
            <span class="rl-title"><span aria-hidden="true">${item.icon}</span> ${U.escapeHtml(this.game.getRecipeTitle(r))}</span>
            <span class="rl-machine">${U.escapeHtml(machine.short || machine.name)}</span>
          </div>
          <div class="rl-flow">${this.compactChips(r.inputs)}<span class="recipe-arrow">→</span>${this.compactChips(r.outputs)}</div>
          <div class="rl-meta">${U.fmt(r.time)} с · ${count ? count + " " + U.plural(count, "здание", "здания", "зданий") : "не построено"}${r.manual ? " · вручную" : ""}</div>
        </div>`;
      }).join("");

      return `<div class="side-section">
        <div class="side-head">Справочник рецептов <span class="meta"><span id="recipeVisibleCount">${unlocked.length}</span> / ${unlocked.length}</span></div>
        <div class="recipe-search-row">
          <input id="sideRecipeSearch" type="search" placeholder="Поиск рецепта…" value="${U.escapeHtml(this.recipeSearch)}" aria-label="Поиск по рецептам">
          <select id="sideRecipeMachine" aria-label="Фильтр по машине">${options}</select>
        </div>
        <div id="recipeCards">${cards}</div>
        <div class="empty-note" id="recipeNoResults" hidden>Ничего не найдено. Очистите поиск или выберите другую машину.</div>
      </div>`;
    }

    applyRecipeFilter() {
      const input = $("sideRecipeSearch");
      const sel = $("sideRecipeMachine");
      if (input) this.recipeSearch = input.value;
      if (sel) this.recipeMachine = sel.value;
      const q = (this.recipeSearch || "").trim().toLowerCase();
      let visible = 0;
      this.dom.sideContent.querySelectorAll(".recipe-list-card").forEach(card => {
        const ok = (!q || (card.dataset.filter || "").includes(q)) &&
          (this.recipeMachine === "all" || card.dataset.machine === this.recipeMachine);
        card.classList.toggle("hidden", !ok);
        if (ok) visible += 1;
      });
      const count = $("recipeVisibleCount");
      if (count) count.textContent = visible;
      const none = $("recipeNoResults");
      if (none) none.hidden = visible > 0;
    }

    statsSideHTML() {
      const s = this.game.stats;
      const session = Math.max(0, (Date.now() - s.sessionStart) / 1000);
      const total = this.game.totalItems();
      const achievements = D.ACHIEVEMENTS || [];
      const doneAch = this.game.achievements.length;

      const achievementsHtml = achievements.map(a => {
        const p = this.game.achievementProgress(a);
        const pct = p.goal > 0 ? (p.value / p.goal) * 100 : 0;
        return `<div class="achievement ${p.done ? "done" : ""}">
          <div class="ach-ico" aria-hidden="true">${a.icon}</div>
          <div class="ach-copy">
            <div class="ach-title">${U.escapeHtml(a.title)} <span class="reward">+${a.crystals} 💠</span></div>
            <p class="ach-desc">${U.escapeHtml(a.desc)}</p>
            <div class="ach-progress"><div class="progress green"><i style="width:${pct.toFixed(1)}%"></i></div><span class="num">${p.done ? "✓" : U.fmtInt(p.value) + " / " + U.fmtInt(p.goal)}</span></div>
          </div>
        </div>`;
      }).join("");

      return `<div class="side-section">
        <div class="side-head">Статистика смены <span class="meta">${U.formatDuration(s.playTime, true)}</span></div>
        <div class="stat-grid">
          <div class="stat-tile"><span class="s-label">Время в игре</span><span class="s-value">${U.formatDuration(s.playTime, true)}</span><span class="s-sub">всего</span></div>
          <div class="stat-tile"><span class="s-label">Сессия</span><span class="s-value">${U.formatDuration(session, true)}</span><span class="s-sub">текущая</span></div>
          <div class="stat-tile"><span class="s-label">Клики</span><span class="s-value">${U.fmtInt(s.clicks)}</span><span class="s-sub">ручная добыча</span></div>
          <div class="stat-tile"><span class="s-label">Ручной крафт</span><span class="s-value">${U.fmtInt(s.manualCrafts)}</span><span class="s-sub">циклов</span></div>
          <div class="stat-tile"><span class="s-label">Здания</span><span class="s-value">${U.fmtInt(this.game.totalBuildings())}</span><span class="s-sub">построено ${U.fmtInt(s.buildingsBuilt)}</span></div>
          <div class="stat-tile"><span class="s-label">Технологии</span><span class="s-value">${this.game.techs.length} / ${D.TECH.length}</span><span class="s-sub">исследовано</span></div>
          <div class="stat-tile"><span class="s-label">Офлайн</span><span class="s-value">${U.formatDuration(s.offlineSeconds, true)}</span><span class="s-sub">всего получено</span></div>
          <div class="stat-tile"><span class="s-label">Кристаллы</span><span class="s-value">${U.fmtInt(s.crystalsEarned)}</span><span class="s-sub">заработано</span></div>
        </div>
      </div>
      <div class="side-section">
        <div class="side-head">Ресурсы за сессию <span class="meta">${U.fmt(total)}</span></div>
        <div class="side-card chart-card">
          <div class="chart-head"><span>суммарный объём склада</span><strong id="chartTotal">${U.fmt(total)}</strong></div>
          <div class="chart-wrap">
            <canvas id="historyChart" aria-label="График объёма склада за сессию"></canvas>
            <div class="chart-empty" id="chartEmpty">данные появятся через несколько секунд</div>
          </div>
        </div>
      </div>
      <div class="side-section">
        <div class="side-head">Достижения <span class="meta">${doneAch} / ${achievements.length}</span></div>
        <div class="ach-list">${achievementsHtml}</div>
      </div>`;
    }

    drawHistoryChart() {
      const canvas = $("historyChart");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      let data = this.game.history.slice(-150);
      if (!data.length) data = [{ t: Date.now(), total: this.game.totalItems() }];
      if (data.length === 1) data = [data[0], { t: Date.now(), total: this.game.totalItems() }];
      const empty = $("chartEmpty");
      if (empty) empty.hidden = true;

      const vals = data.map(p => Number(p.total) || 0);
      let min = Math.min(...vals);
      let max = Math.max(...vals);
      if (max - min < 1) { max = min + 1; }
      const pad = 6;
      const w = rect.width - pad * 2;
      const h = rect.height - pad * 2;
      const xOf = i => pad + (i / Math.max(1, data.length - 1)) * w;
      const yOf = v => pad + h - ((v - min) / (max - min)) * h;

      ctx.strokeStyle = "rgba(96,132,154,.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i += 1) {
        const y = pad + (h / 2) * i;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(pad + w, y);
        ctx.stroke();
      }

      const grad = ctx.createLinearGradient(0, pad, 0, pad + h);
      grad.addColorStop(0, "rgba(95,208,212,.22)");
      grad.addColorStop(1, "rgba(95,208,212,0)");

      ctx.beginPath();
      ctx.moveTo(xOf(0), pad + h);
      data.forEach((p, i) => ctx.lineTo(xOf(i), yOf(Number(p.total) || 0)));
      ctx.lineTo(xOf(data.length - 1), pad + h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      data.forEach((p, i) => {
        const x = xOf(i);
        const y = yOf(Number(p.total) || 0);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#5fd0d4";
      ctx.lineWidth = 1.6;
      ctx.lineJoin = "round";
      ctx.stroke();

      const lx = xOf(data.length - 1);
      const ly = yOf(Number(data[data.length - 1].total) || 0);
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#9be8eb";
      ctx.fill();

      const label = $("chartTotal");
      if (label) label.textContent = U.fmt(this.game.totalItems());
    }

    /* ── Действия ──────────────────────────────────────── */
    doGather(id, el) {
      const res = this.game.gather(id);
      if (!res.ok) {
        this.sound.play("error");
        return;
      }
      this.sound.play("click");
      const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      this.floatText(`+${U.fmt(res.amount)}`, rect ? rect.left + rect.width / 2 : window.innerWidth / 2, rect ? rect.top + rect.height / 2 : window.innerHeight / 2);
      this.updateGatherButtons();
      if (this.prodTree) this.prodTree.updateLive();
      this.updateInspectorLive();
      if (!this.dom.overview.hidden) this.renderChecklist();
      this.updateBadges();
    }

    doCraft(rid, el) {
      const res = this.game.craftManual(rid);
      if (!res.ok) {
        this.sound.play("error");
        if (res.reason === "cost") this.toast({ icon: "⚠️", title: "Не хватает ресурсов", text: this.formatCost(res.missing), type: "error" });
        return;
      }
      this.sound.play("craft");
      const r = this.game.getRecipe(rid);
      const out = this.game.getPrimaryOutput(r);
      const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      this.floatText(`+${U.fmt(r.outputs[out])} ${D.ITEMS[out].name}`, rect ? rect.left + rect.width / 2 : window.innerWidth / 2, rect ? rect.top : window.innerHeight / 2, "craft");
      if (this.prodTree) this.prodTree.updateLive();
      this.updateInspectorLive();
      if (!this.dom.overview.hidden) this.renderChecklist();
      this.updateBadges();
    }

    doBuild(rid, count, el) {
      const res = this.game.addMachines(rid, count);
      if (!res.ok && !res.built) {
        this.sound.play("error");
        this.toast({ icon: "⚠️", title: "Постройка невозможна", text: res.reason === "cost" ? `Не хватает: ${this.formatCost(res.missing)}` : "Технология или рецепт ещё закрыты.", type: "error" });
        return;
      }
      const r = this.game.getRecipe(rid);
      const machine = D.MACHINES[r.machine];
      this.sound.play("build");
      this.toast({ icon: machine.icon, title: `Построено: ${machine.name}`, text: `+${res.built} ${U.plural(res.built, "здание", "здания", "зданий")}${res.reason === "cost" ? " · на остальные не хватило ресурсов" : ""}`, type: "info" });
      this.refreshAll();
      this.save(true);
    }

    doRemove(rid, count) {
      const res = this.game.removeMachines(rid, count);
      if (!res.ok) {
        this.sound.play("error");
        return;
      }
      this.sound.play("remove");
      this.toast({ icon: "🧱", title: "Здание снято", text: res.refund && Object.keys(res.refund).length ? `Возврат: ${this.formatCost(res.refund)}` : "Линия остановлена.", type: "info" });
      this.refreshAll();
      this.save(true);
    }

    doResearch(id) {
      const res = this.game.research(id);
      if (!res.ok) {
        this.sound.play("error");
        let text = "Технология пока недоступна.";
        if (res.reason === "cost") text = `Не хватает: ${this.formatCost(res.missing || {})}`;
        else if (res.reason === "requires") text = `Сначала: ${(res.missingTechs || []).map(x => D.TECH_BY_ID[x].title).join(", ")}`;
        else if (res.reason === "researched") text = "Эта технология уже изучена.";
        this.toast({ icon: "🔒", title: "Исследование недоступно", text, type: "error" });
        this.techGraph.refresh();
        return;
      }
      const t = res.tech;
      this.sound.play("tech");
      const bits = [];
      if (t.unlocks.machines && t.unlocks.machines.length) bits.push(`${t.unlocks.machines.length} ${U.plural(t.unlocks.machines.length, "здание", "здания", "зданий")}`);
      if (t.unlocks.resources && t.unlocks.resources.length) bits.push(`${t.unlocks.resources.length} ${U.plural(t.unlocks.resources.length, "ресурс", "ресурса", "ресурсов")}`);
      if (t.unlocks.recipes && t.unlocks.recipes.length) bits.push(`${t.unlocks.recipes.length} ${U.plural(t.unlocks.recipes.length, "рецепт", "рецепта", "рецептов")}`);
      this.toast({
        icon: t.icon,
        title: `Исследовано: ${t.title}`,
        text: `+${res.reward} 💠${bits.length ? " · открыто: " + bits.join(", ") : ""}`,
        type: "tech",
        duration: 5200
      });
      this.refreshAll();
      this.techGraph.refresh();
      this.save(true);
      if (res.victory) {
        if (this.dom.techDialog.open) this.dom.techDialog.close();
        setTimeout(() => this.showVictory(t), 180);
      }
    }

    buyBoost() {
      const res = this.game.buyBoost();
      if (!res.ok) {
        this.sound.play("error");
        this.toast({ icon: "💠", title: "Не хватает кристаллов", text: "Нужно 5 кристаллов. Их дают исследования и достижения.", type: "error" });
        return;
      }
      this.sound.play("boost");
      this.toast({ icon: "⚡", title: "Ускорение ×2 включено", text: `До ${U.formatClock(res.until)}. Производство идёт вдвое быстрее.`, type: "info" });
      this.updateHUD();
      this.save(true);
    }

    refreshAll() {
      if (this.prodTree) this.prodTree.rebuild(true);
      this.renderProperties();
      this.renderSide();
      this.updateHUD();
      this.updateBadges();
      this.techGraph.refresh();
      this.updateSaveInfo();
    }

    /* ── HUD / сохранения ──────────────────────────────── */
    updateHUD() {
      this.dom.crystalCount.textContent = U.fmt(this.game.crystals);
      const active = this.game.isBoostActive();
      this.dom.boostBtn.classList.toggle("active", active);
      this.dom.boostBtn.disabled = this.game.crystals < 5;
      this.dom.boostBtn.title = active
        ? "Ускорение ×2 уже работает. Нажмите, чтобы продлить ещё на 5 минут за 5 кристаллов."
        : "Ускорить всё производство вдвое на 5 минут за 5 кристаллов.";
      this.dom.boostLabel.textContent = active
        ? `${U.formatDuration(this.game.boostRemaining(), true)} · ×2`
        : "5 кристаллов";

      const clickActive = this.game.isClickBoostActive();
      this.dom.clickBoostBtn.classList.toggle("active", clickActive);
      this.dom.clickBoostBtn.disabled = this.game.crystals < 3;
      this.dom.clickBoostBtn.title = clickActive
        ? "Клик ×10 уже работает. Нажмите, чтобы продлить ещё на 2 минуты за 3 кристалла."
        : "Увеличить ручную добычу в 10 раз на 2 минуты за 3 кристалла.";
      this.dom.clickBoostLabel.textContent = clickActive
        ? `${U.formatDuration(this.game.clickBoostRemaining(), true)} · ×10`
        : "3 кристалла";
      this.dom.shiftNumber.textContent = this.shiftNumber();
    }

    buyClickBoost() {
      const res = this.game.buyClickBoost();
      if (!res.ok) {
        this.sound.play("error");
        this.toast({ icon: "💠", title: "Не хватает кристаллов", text: "Нужно 3 кристалла. Их дают исследования и достижения.", type: "error" });
        return;
      }
      this.sound.play("boost");
      this.toast({ icon: "⛏️", title: "Клик ×10 включён", text: `До ${U.formatClock(res.until)}. Каждый удар даёт в 10 раз больше.`, type: "info" });
      this.updateHUD();
      this.save(true);
    }

    setSaveState(state, text) {
      this.dom.saveState.className = "save-state " + state;
      this.dom.saveText.textContent = text;
    }

    updateSaveState(state, text) {
      this.setSaveState(state, text);
    }

    save(silent) {
      this.setSaveState("saving", "Сохранение…");
      const res = this.game.save();
      if (res.ok) {
        this.setSaveState("normal", "Сохранено " + U.formatClock(this.game.lastSave));
        if (!silent) {
          this.sound.play("save");
          this.toast({ icon: "💾", title: "Сохранено", text: `Сейв записан в localStorage · ${U.formatClock(this.game.lastSave)}`, type: "info" });
        }
        this.updateSaveInfo();
      } else {
        this.setSaveState("error", "Ошибка сохранения");
        this.toast({ icon: "⚠️", title: "Не удалось сохранить", text: res.error || "localStorage недоступен.", type: "error" });
      }
    }

    updateSaveInfo() {
      const info = $("saveInfo");
      const stats = $("settingsStats");
      if (info) info.textContent = `Сохранено ${U.formatClock(this.game.lastSave)}`;
      if (stats) stats.textContent = `${this.game.techs.length} техн. · ${this.game.totalBuildings()} зданий · ${this.game.achievements.length} достижений`;
    }

    openSettings() {
      $("settingSound").checked = !!this.game.settings.sound;
      $("settingParticles").checked = !!this.game.settings.particles;
      this.resetArmed = false;
      $("resetBtn").textContent = "Сбросить";
      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.updateSaveInfo();
      this.dom.settingsDialog.showModal();
    }

    openExport() {
      const str = this.game.serialize();
      this.exportString = str;
      $("exportText").value = str;
      if (this.dom.settingsDialog.open) this.dom.settingsDialog.close();
      if (!this.dom.exportDialog.open) this.dom.exportDialog.showModal();
      U.copyText(str).then(ok => {
        this.toast({ icon: ok ? "📋" : "💾", title: ok ? "Сейв скопирован" : "Сейв готов", text: ok ? "JSON в буфере обмена." : "Нажмите «Скопировать» или скачайте файл.", type: "info" });
      });
    }

    openImport() {
      $("importText").value = "";
      $("importFile").value = "";
      this.setImportError("");
      if (this.dom.settingsDialog.open) this.dom.settingsDialog.close();
      if (!this.dom.importDialog.open) this.dom.importDialog.showModal();
    }

    setImportError(text) {
      const el = $("importError");
      el.textContent = text || "";
      el.hidden = !text;
    }

    loadImport() {
      const text = $("importText").value.trim();
      if (!text) {
        this.setImportError("Вставьте JSON сейва или выберите файл.");
        return;
      }
      const res = this.game.loadString(text);
      if (!res.ok) {
        this.setImportError(res.reason === "json" ? "Это не корректный JSON." : "Не удалось прочитать сейв: неверный формат.");
        return;
      }
      const offline = this.game.simulateOffline(res.elapsed || 0);
      this.dom.importDialog.close();
      this.recipeSearch = "";
      this.recipeMachine = "all";
      this.sideTab = "properties";
      this.dom.prodSearch.value = "";
      this.closeProdSearch();
      this.applySettings();
      this.refreshAll();
      this.techGraph.refresh();
      this.setMobileView(window.innerWidth <= 980 ? "side" : "tree");
      this.save(true);
      this.toast({ icon: "📥", title: "Сейв загружен", text: "Прогресс восстановлен.", type: "info" });
      if (offline.seconds >= 60) this.showOffline(offline);
      else if (offline.seconds > 1) this.toast({ icon: "🌙", title: "Офлайн-прогресс", text: `Начислено за ${U.formatDuration(offline.seconds)}.`, type: "info" });
    }

    resetProgress() {
      const btn = $("resetBtn");
      if (!this.resetArmed) {
        this.resetArmed = true;
        btn.textContent = "Точно сбросить?";
        btn.classList.add("danger");
        if (this.resetTimer) clearTimeout(this.resetTimer);
        this.resetTimer = setTimeout(() => {
          this.resetArmed = false;
          btn.textContent = "Сбросить";
          btn.classList.remove("danger");
        }, 4500);
        return;
      }
      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetArmed = false;
      this.game.hardReset();
      this.sideTab = "properties";
      this.recipeSearch = "";
      this.recipeMachine = "all";
      this.dom.prodSearch.value = "";
      this.closeProdSearch();
      this.applySettings();
      this.game.pushHistory();
      this.dom.settingsDialog.close();
      this.setMobileView(window.innerWidth <= 980 ? "side" : "tree");
      this.refreshAll();
      this.techGraph.refresh();
      this.save(true);
      this.toast({ icon: "🧹", title: "Прогресс сброшен", text: "Начинаем новый цикл.", type: "info" });
    }

    applySettings() {
      $("settingSound").checked = !!this.game.settings.sound;
      $("settingParticles").checked = !!this.game.settings.particles;
      if (this.sound) this.sound.enabled = !!this.game.settings.sound;
      if (this.ambient) this.ambient.setEnabled(!!this.game.settings.particles);
    }

    /* ── Мобильные виды ────────────────────────────────── */
    setMobileView(view) {
      this.mobileView = view;
      document.querySelectorAll(".panel[data-view]").forEach(panel => {
        panel.classList.toggle("mobile-active", panel.dataset.view === view);
      });
      this.dom.mobileNav.querySelectorAll("[data-mobile-view]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mobileView === view);
      });
      if (view === "side") {
        this.renderSide();
        if (this.sideTab === "stats") requestAnimationFrame(() => this.drawHistoryChart());
      }
      this.updateBadges();
    }

    /* ── Офлайн, тосты, эффекты ───────────────────────── */
    showOffline(res) {
      if (!res || res.seconds < 1) return;
      this.dom.offlineText.textContent = `Пока вас не было ${U.formatDuration(res.seconds)}, завод работал без остановки.`;
      const gains = res.top || [];
      this.dom.offlineGains.innerHTML = gains.length
        ? gains.map(g => {
          const item = D.ITEMS[g.id];
          return `<div class="gain-row"><span class="g-ico" aria-hidden="true">${item.icon}</span><span class="g-name">${U.escapeHtml(item.name)}</span><span class="g-amt">+${U.fmt(g.amount)}</span></div>`;
        }).join("")
        : `<div class="empty-note" style="grid-column:1/-1">Склад не вырос: линии не были построены или всё ушло в переработку.</div>`;
      this.dom.offlineNote.textContent = res.capped
        ? `Вы отсутствовали дольше лимита. Начислен максимум — 8 часов.`
        : `Офлайн-прогресс считается по фактическим линиям и ограничен 8 часами.`;
      if (!this.dom.offlineDialog.open) this.dom.offlineDialog.showModal();
      this.save(true);
    }

    toast(opts) {
      const el = document.createElement("div");
      el.className = "toast " + (opts.type || "info");
      el.innerHTML = `<span class="t-ico" aria-hidden="true">${opts.icon || "•"}</span>
        <span class="t-copy"><span class="t-title">${U.escapeHtml(opts.title || "")}</span>${opts.text ? `<span class="t-text">${U.escapeHtml(opts.text)}</span>` : ""}</span>`;
      while (this.dom.toasts.children.length >= 4) {
        this.dom.toasts.removeChild(this.dom.toasts.firstChild);
      }
      this.dom.toasts.appendChild(el);
      const duration = opts.duration || 4200;
      setTimeout(() => {
        el.classList.add("leaving");
        setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
      }, duration);
    }

    floatText(text, x, y, cls) {
      const el = document.createElement("span");
      el.className = "float-text " + (cls || "");
      el.textContent = text;
      el.style.left = x + "px";
      el.style.top = y + "px";
      document.body.appendChild(el);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
    }

    drainEvents() {
      const events = this.game.drainEvents();
      for (const ev of events) {
        if (ev.type === "achievement") {
          const a = ev.achievement;
          this.sound.play("achievement");
          this.toast({ icon: a.icon, title: `Достижение: ${a.title}`, text: `${a.desc} · +${a.crystals} 💠`, type: "achievement", duration: 5600 });
          this.updateHUD();
          if (this.sideTab === "stats") this.renderSide();
          this.updateBadges();
        } else if (ev.type === "tech") {
          this.techGraph.refresh();
          this.updateBadges();
        }
      }
    }

    /* ── Поиск по дереву производства ─────────────────── */
    onProdSearchInput() {
      const q = this.dom.prodSearch.value.trim();
      this.dom.clearProdSearch.hidden = !q;
      if (!q) { this.closeProdSearch(); return; }
      const lower = q.toLowerCase();
      const known = this.knownIds();
      const matches = known
        .filter(id => D.ITEMS[id].name.toLowerCase().includes(lower) || id.toLowerCase().includes(lower))
        .sort((a, b) => {
          const an = D.ITEMS[a].name.toLowerCase();
          const bn = D.ITEMS[b].name.toLowerCase();
          const ap = an.indexOf(lower) === 0 ? 0 : an.includes(lower) ? 1 : 2;
          const bp = bn.indexOf(lower) === 0 ? 0 : bn.includes(lower) ? 1 : 2;
          return ap - bp || an.localeCompare(bn);
        })
        .slice(0, 8);
      this.searchMatches = matches;
      this.searchActive = matches.length ? 0 : -1;

      if (!matches.length) {
        this.dom.prodSearchResults.innerHTML = `<div class="search-result empty">Ничего не найдено</div>`;
      } else {
        this.dom.prodSearchResults.innerHTML = matches.map(id => {
          const item = D.ITEMS[id];
          const stats = this.game.getItemStats(id);
          const bal = Math.abs(stats.balance) < 0.0005 ? "0/с" : `${U.fmtSigned(stats.balance)}/с`;
          return `<button class="search-result" type="button" role="option" data-search-item="${id}">
            <span class="sr-ico" aria-hidden="true">${item.icon}</span>
            <span class="sr-name">${U.escapeHtml(item.name)}</span>
            <span class="sr-meta"><strong>${U.fmt(this.game.items[id] || 0)}</strong> · ${bal}</span>
          </button>`;
        }).join("");
      }
      this.dom.prodSearchResults.hidden = false;
      this.dom.prodSearch.setAttribute("aria-expanded", "true");
      this.paintSearchActive();
    }

    paintSearchActive() {
      const buttons = this.dom.prodSearchResults.querySelectorAll("[data-search-item]");
      buttons.forEach((btn, i) => {
        const on = i === this.searchActive;
        btn.classList.toggle("active", on);
        if (on) btn.scrollIntoView({ block: "nearest" });
      });
    }

    chooseSearchResult(id) {
      this.closeProdSearch();
      this.selectItem(id, { fromSearch: true });
      if (this.prodTree) {
        requestAnimationFrame(() => {
          this.prodTree.focusItem(id);
          this.prodTree.focusItem(id);
        });
      }
    }

    closeProdSearch() {
      if (!this.dom.prodSearchResults) return;
      this.dom.prodSearchResults.hidden = true;
      this.dom.prodSearch.setAttribute("aria-expanded", "false");
      this.searchActive = -1;
    }

    /* ── Бейджи уведомлений ────────────────────────────── */
    updateBadges() {
      const selected = this.game.selectedItem;
      const selectedStats = selected && D.ITEMS[selected] ? this.game.getItemStats(selected) : null;
      const counts = {
        properties: selectedStats && selectedStats.balance < -0.001 ? 1 : 0,
        map: this.game.getAvailableTechs().length,
        buildings: this.game.getStarvedLineCount(),
        recipes: this.game.getNewRecipeCount(),
        stats: this.game.getNewAchievementCount()
      };
      const panelVisible = window.innerWidth > 980 || this.mobileView === "side";
      if (panelVisible && this.sideTab === "recipes") {
        this.game.markRecipesSeen();
        counts.recipes = 0;
      }
      if (panelVisible && this.sideTab === "stats") {
        this.game.markAchievementsSeen();
        counts.stats = 0;
      }
      counts.mobile = counts.properties + counts.map + counts.buildings + counts.recipes + counts.stats;
      document.querySelectorAll("[data-badge-tab]").forEach(el => {
        const key = el.dataset.badgeTab;
        const count = counts[key] || 0;
        if (count > 0) {
          el.hidden = false;
          el.textContent = count > 99 ? "99+" : String(count);
          el.title = `${count} уведомлений`;
        } else {
          el.hidden = true;
        }
      });
    }

    showVictory(tech) {
      const stats = $("victoryStats");
      if (stats) {
        stats.innerHTML = `
          <div><strong>${this.game.techs.length}</strong>технологий</div>
          <div><strong>${U.fmtInt(this.game.totalBuildings())}</strong>зданий</div>
          <div><strong>${U.fmtInt(this.game.stats.playTime / 3600)}</strong>часов</div>
          <div><strong>${U.fmtInt(this.game.crystals)}</strong>кристаллов</div>`;
      }
      const title = $("victoryTitle");
      if (title) title.textContent = tech && tech.title ? "Ракета собрана" : "Проект завершён";
      if (!this.dom.victoryDialog.open) this.dom.victoryDialog.showModal();
      this.sound.play("achievement");
    }

    openTech(id) {
      this.sound.play("open");
      this.techGraph.open(id || null);
    }

    /* ── Цикл обновления ───────────────────────────────── */
    frame(now) {
      const t = now || performance.now();
      if (t - this.lastFast >= 240) {
        this.lastFast = t;
        this.updateHUD();
        this.updateHeroStatus();
        this.updateGatherButtons();
        if (this.prodTree) this.prodTree.updateLive();
        this.updateInspectorLive();
        this.drainEvents();
      }
      if (t - this.lastBadges >= 700) {
        this.lastBadges = t;
        if (this.prodTree) this.prodTree.maybeRebuild();
        this.updateBadges();
      }
      if (t - this.lastOverview >= 3000) {
        this.lastOverview = t;
        if (this.sideTab === "properties" && !this.dom.overview.hidden) {
          this.renderNextTech();
          this.renderFlow();
          this.renderChecklist();
        }
      }
      if (t - this.lastTechRefresh >= 4000) {
        this.lastTechRefresh = t;
        if (this.dom.techDialog.open) this.techGraph.refresh();
      }
      if (t - this.lastSideLive >= 3000) {
        this.lastSideLive = t;
        const visible = window.innerWidth > 980 || this.mobileView === "side";
        if (visible && (this.sideTab === "tree" || this.sideTab === "buildings" || this.sideTab === "stats") && !document.hidden) {
          this.renderSide();
        }
      }
    }
  }

  window.COR.UI = UI;
})();
