/* Цикл ресурсов — игровой движок: экономика, производство, офлайн, сохранения. */
(function () {
  const D = window.COR.DATA;
  const U = window.COR.util;
  const SAVE_KEY = "cor_save_v1";
  const VERSION = 1;
  const MAX_OFFLINE = 8 * 3600;
  const BOOST_COST = 5;
  const BOOST_MS = 5 * 60 * 1000;
  const CLICK_BOOST_COST = 3;
  const CLICK_BOOST_MS = 2 * 60 * 1000;
  const ITEM_IDS = Object.keys(D.ITEMS);

  const RECIPE_BY_ID = {};
  D.RECIPES.forEach(r => { RECIPE_BY_ID[r.id] = r; });

  const STAT_DEFAULTS = {
    playTime: 0,
    clicks: 0,
    manualGathered: 0,
    manualCrafts: 0,
    buildingsBuilt: 0,
    buildingsRemoved: 0,
    techsResearched: 0,
    crystalsEarned: 0,
    offlineSeconds: 0,
    totalProduced: 0,
    totalConsumed: 0,
    boostsBought: 0,
    machineTypes: [],
    startedAt: 0,
    sessionStart: 0
  };

  class Game {
    constructor() {
      this.settings = { sound: true, particles: true };
      this.reset();
    }

    reset() {
      this.items = {};
      ITEM_IDS.forEach(id => { this.items[id] = 0; });
      this.lines = {};
      this.techs = [];
      this.crystals = 0;
      this.boostUntil = 0;
      this.clickBoostUntil = 0;
      this.createdAt = Date.now();
      this.lastSave = Date.now();
      this.lastTick = 0;
      this.stats = Object.assign({}, STAT_DEFAULTS, {
        startedAt: Date.now(),
        sessionStart: Date.now(),
        machineTypes: []
      });
      this.achievements = [];
      this.history = [];
      this.events = [];
      this.selectedItem = null;
      this.rates = {};
      ITEM_IDS.forEach(id => { this.rates[id] = { prod: 0, cons: 0 }; });
      this.lineRates = {};
      this._historyTimer = 0;
      this._achievementTimer = 0;
      this.rebuildUnlocks();
      this.seenRecipes = Array.from(this.unlocked.recipes);
      this.seenAchievements = [];
    }

    /* ── Разблокировка ─────────────────────────────────── */
    rebuildUnlocks() {
      const machines = new Set(D.START.machines || []);
      const recipes = new Set(D.START.recipes || []);
      const resources = new Set(D.START.resources || []);
      const effects = { clickMult: 1, extractMult: 1, prodMult: 1 };

      for (const id of this.techs) {
        const t = D.TECH_BY_ID[id];
        if (!t) continue;
        (t.unlocks.machines || []).forEach(m => machines.add(m));
        (t.unlocks.recipes || []).forEach(r => recipes.add(r));
        (t.unlocks.resources || []).forEach(r => resources.add(r));
        if (t.effect) {
          if (t.effect.clickMult) effects.clickMult *= t.effect.clickMult;
          if (t.effect.extractMult) effects.extractMult *= t.effect.extractMult;
          if (t.effect.prodMult) effects.prodMult *= t.effect.prodMult;
        }
      }

      this.unlocked = { machines, recipes, resources };
      this.effects = effects;

      this.knownItems = new Set();
      resources.forEach(id => {
        if (D.ITEMS[id]) this.knownItems.add(id);
      });
      recipes.forEach(rid => {
        const r = RECIPE_BY_ID[rid];
        if (!r) return;
        Object.keys(r.outputs).forEach(id => {
          if (D.ITEMS[id]) this.knownItems.add(id);
        });
        Object.keys(r.inputs || {}).forEach(id => {
          if (D.ITEMS[id]) this.knownItems.add(id);
        });
      });

      this.productionRecipes = D.RECIPES.slice().sort((a, b) => {
        const oa = (D.MACHINES[a.machine] && D.MACHINES[a.machine].order) || 99;
        const ob = (D.MACHINES[b.machine] && D.MACHINES[b.machine].order) || 99;
        return oa - ob || a.id.localeCompare(b.id);
      });

      /* Не теряем историю построек: достижение «Все профессии» считает
         типы, которые когда-либо строили, а не только текущие линии. */
      const builtTypes = new Set(this.stats.machineTypes || []);
      for (const [rid, count] of Object.entries(this.lines)) {
        if (count > 0 && RECIPE_BY_ID[rid]) builtTypes.add(RECIPE_BY_ID[rid].machine);
      }
      this.stats.machineTypes = Array.from(builtTypes);
    }

    isKnown(id) {
      return this.knownItems.has(id) || (this.items[id] || 0) > 0.0001;
    }

    isGatherable(id) {
      const item = D.ITEMS[id];
      return !!(item && item.gather && this.unlocked.resources.has(id));
    }

    isRecipeUnlocked(rid) {
      return this.unlocked.recipes.has(rid);
    }

    getRecipe(rid) {
      return RECIPE_BY_ID[rid] || null;
    }

    getPrimaryOutput(recipe) {
      if (!recipe || !recipe.outputs) return null;
      const keys = Object.keys(recipe.outputs);
      return keys.length ? keys[0] : null;
    }

    getRecipeTitle(recipe) {
      if (!recipe) return "—";
      const out = this.getPrimaryOutput(recipe);
      const item = out ? D.ITEMS[out] : null;
      if (!item) return recipe.name || recipe.id;
      return item.name + (recipe.id.indexOf("alternate") === 0 ? " · альт" : "");
    }

    /* ── Ручные действия ───────────────────────────────── */
    gather(id) {
      const item = D.ITEMS[id];
      if (!item || !this.isGatherable(id)) {
        return { ok: false, reason: "locked" };
      }
      const clickBonus = this.isClickBoostActive() ? 10 : 1;
      const amount = item.gather * this.effects.clickMult * clickBonus;
      this.items[id] = (this.items[id] || 0) + amount;
      this.stats.clicks += 1;
      this.stats.manualGathered += amount;
      return { ok: true, amount };
    }

    craftManual(rid) {
      const r = RECIPE_BY_ID[rid];
      if (!r) return { ok: false, reason: "unknown" };
      if (!r.manual) return { ok: false, reason: "not-manual" };
      if (!this.unlocked.recipes.has(rid)) return { ok: false, reason: "locked" };
      if (!this.canAfford(r.inputs || {})) {
        return { ok: false, reason: "cost", missing: this.missingFor(r.inputs || {}) };
      }
      this.pay(r.inputs || {});
      const outputs = {};
      for (const [id, qty] of Object.entries(r.outputs || {})) {
        this.items[id] = (this.items[id] || 0) + qty;
        outputs[id] = qty;
      }
      this.stats.manualCrafts += 1;
      this.stats.clicks += 1;
      return { ok: true, outputs };
    }

    canAfford(cost) {
      for (const [id, qty] of Object.entries(cost || {})) {
        if ((this.items[id] || 0) + 1e-9 < qty) return false;
      }
      return true;
    }

    missingFor(cost) {
      const missing = {};
      for (const [id, qty] of Object.entries(cost || {})) {
        const deficit = qty - (this.items[id] || 0);
        if (deficit > 1e-9) missing[id] = deficit;
      }
      return missing;
    }

    pay(cost) {
      for (const [id, qty] of Object.entries(cost || {})) {
        this.items[id] = Math.max(0, (this.items[id] || 0) - qty);
      }
    }

    addItem(id, qty) {
      this.items[id] = (this.items[id] || 0) + qty;
    }

    /* ── Здания ────────────────────────────────────────── */
    ownedOfType(type) {
      let n = 0;
      for (const [rid, count] of Object.entries(this.lines)) {
        const r = RECIPE_BY_ID[rid];
        if (r && r.machine === type) n += count;
      }
      return n;
    }

    machineCost(type) {
      const m = D.MACHINES[type];
      if (!m) return {};
      /* Стоимость строительства фиксированная: она не растёт с каждой машиной. */
      const out = {};
      for (const [id, qty] of Object.entries(m.cost || {})) {
        out[id] = Math.max(1, Math.ceil(qty - 1e-9));
      }
      return out;
    }

    nextMachineCost(rid) {
      const r = RECIPE_BY_ID[rid];
      return r ? this.machineCost(r.machine) : {};
    }

    refundFor(type, owned) {
      const cost = this.machineCost(type, Math.max(0, owned - 1));
      const out = {};
      for (const [id, qty] of Object.entries(cost)) {
        const v = Math.floor(qty * 0.5);
        if (v > 0) out[id] = v;
      }
      return out;
    }

    addMachines(rid, amount) {
      const r = RECIPE_BY_ID[rid];
      if (!r) return { ok: false, reason: "unknown" };
      if (!this.unlocked.recipes.has(rid)) return { ok: false, reason: "recipe-locked" };
      if (!this.unlocked.machines.has(r.machine)) return { ok: false, reason: "machine-locked" };

      const target = Math.max(1, Math.floor(amount || 1));
      let built = 0;
      let lastCost = null;
      const spent = {};

      for (let i = 0; i < target; i += 1) {
        const cost = this.machineCost(r.machine);
        if (!this.canAfford(cost)) {
          return {
            ok: built > 0,
            built,
            spent,
            reason: "cost",
            cost,
            missing: this.missingFor(cost)
          };
        }
        this.pay(cost);
        lastCost = cost;
        Object.keys(cost).forEach(id => { spent[id] = (spent[id] || 0) + cost[id]; });
        this.lines[rid] = (this.lines[rid] || 0) + 1;
        this.stats.buildingsBuilt += 1;
        if (!this.stats.machineTypes.includes(r.machine)) this.stats.machineTypes.push(r.machine);
        built += 1;
      }

      return { ok: true, built, spent, cost: lastCost };
    }

    removeMachines(rid, amount) {
      const count = this.lines[rid] || 0;
      if (count <= 0) return { ok: false, reason: "empty" };
      const r = RECIPE_BY_ID[rid];
      if (!r) return { ok: false, reason: "unknown" };

      const target = Math.min(count, Math.max(1, Math.floor(amount || 1)));
      const refund = {};
      for (let i = 0; i < target; i += 1) {
        const owned = this.ownedOfType(r.machine);
        const back = this.refundFor(r.machine, owned);
        for (const [id, qty] of Object.entries(back)) {
          this.items[id] = (this.items[id] || 0) + qty;
          refund[id] = (refund[id] || 0) + qty;
        }
        this.lines[rid] = (this.lines[rid] || 0) - 1;
        if (this.lines[rid] <= 0) delete this.lines[rid];
        this.stats.buildingsRemoved += 1;
      }
      return { ok: true, removed: target, refund };
    }

    totalBuildings() {
      let n = 0;
      for (const v of Object.values(this.lines)) n += v;
      return n;
    }

    getLineInfo(rid) {
      const r = RECIPE_BY_ID[rid];
      if (!r) return null;
      const count = this.lines[rid] || 0;
      const speed = count * this.effects.prodMult / r.time * (r.extraction ? this.effects.extractMult : 1);
      const actual = this.lineRates[rid] || null;
      const cycles = actual ? actual.cycles : 0;
      const utilization = actual ? actual.utilization : 0;
      const out = {};
      for (const [id, qty] of Object.entries(r.outputs || {})) out[id] = cycles * qty;
      const input = {};
      for (const [id, qty] of Object.entries(r.inputs || {})) input[id] = cycles * qty;
      return { count, speed, cycles, utilization, outputs: out, inputs: input };
    }

    getMachineGroups() {
      /* Map, а не {}: id машины "constructor" иначе читает
         Object.prototype.constructor и ломает .lines.push(). */
      const groups = new Map();
      for (const [rid, count] of Object.entries(this.lines)) {
        if (!count) continue;
        const r = RECIPE_BY_ID[rid];
        if (!r) continue;
        let g = groups.get(r.machine);
        if (!g) {
          g = {
            type: r.machine,
            machine: D.MACHINES[r.machine],
            count: 0,
            lines: []
          };
          groups.set(r.machine, g);
        }
        g.count += count;
        g.lines.push({ rid, count, recipe: r, info: this.getLineInfo(rid) });
      }
      return Array.from(groups.values()).sort((a, b) => a.machine.order - b.machine.order);
    }

    /* ── Экономика ─────────────────────────────────────── */
    step(dt, offline) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      const boost = !offline && this.isBoostActive();
      const simDt = dt * (boost ? 2 : 1);

      const active = [];
      for (const r of this.productionRecipes) {
        const count = this.lines[r.id] || 0;
        if (count <= 0 || !this.unlocked.recipes.has(r.id)) continue;
        const nominal = simDt * count * this.effects.prodMult / r.time *
          (r.extraction ? this.effects.extractMult : 1);
        if (nominal > 0) active.push({ r, count, nominal, scale: 1 });
      }

      const prod = Object.create(null);
      const cons = Object.create(null);
      const lineRates = {};

      if (!active.length) {
        this.lineRates = lineRates;
        this.updateRates(prod, cons, simDt);
        return;
      }

      const scales = new Array(active.length).fill(1);

      /* Пропорциональная балансировка: ни один вход не расходуется больше, чем есть. */
      for (let iter = 0; iter < 12; iter += 1) {
        const supply = Object.create(null);
        const need = Object.create(null);
        for (const id of ITEM_IDS) supply[id] = this.items[id] || 0;

        for (let i = 0; i < active.length; i += 1) {
          const sc = scales[i];
          if (sc <= 0) continue;
          const a = active[i];
          const cyc = a.nominal * sc;
          for (const [id, q] of Object.entries(a.r.outputs || {})) {
            supply[id] = (supply[id] || 0) + q * cyc;
          }
          for (const [id, q] of Object.entries(a.r.inputs || {})) {
            need[id] = (need[id] || 0) + q * cyc;
          }
        }

        let changed = false;
        for (const id in need) {
          const available = supply[id] || 0;
          const required = need[id];
          if (required <= available + 1e-9) continue;
          const ratio = available > 0 ? available / required : 0;
          for (let i = 0; i < active.length; i += 1) {
            if (!active[i].r.inputs || !active[i].r.inputs[id]) continue;
            const next = scales[i] * ratio;
            if (next < scales[i]) {
              scales[i] = next;
              changed = true;
            }
          }
        }
        if (!changed) break;
      }

      for (let i = 0; i < active.length; i += 1) {
        const a = active[i];
        let scale = scales[i];
        if (!(scale > 0)) {
          lineRates[a.r.id] = { cycles: 0, utilization: 0, nominal: a.nominal / simDt };
          continue;
        }

        /* Финальная проверка по фактическому остатку — защита от порядка строк. */
        for (const [id, q] of Object.entries(a.r.inputs || {})) {
          const needQty = q * a.nominal * scale;
          const have = this.items[id] || 0;
          if (needQty > have + 1e-9) {
            scale = Math.min(scale, have / (q * a.nominal));
          }
        }
        if (!(scale > 0)) {
          lineRates[a.r.id] = { cycles: 0, utilization: 0, nominal: a.nominal / simDt };
          continue;
        }

        const cycles = a.nominal * scale;
        for (const [id, q] of Object.entries(a.r.inputs || {})) {
          const take = Math.min(this.items[id] || 0, q * cycles);
          this.items[id] = Math.max(0, (this.items[id] || 0) - take);
          cons[id] = (cons[id] || 0) + take;
        }
        for (const [id, q] of Object.entries(a.r.outputs || {})) {
          const add = q * cycles;
          this.items[id] = (this.items[id] || 0) + add;
          prod[id] = (prod[id] || 0) + add;
        }
        lineRates[a.r.id] = { cycles: cycles / simDt, utilization: scale, nominal: a.nominal / simDt };
      }

      for (const id of ITEM_IDS) {
        if (this.items[id] < 0) this.items[id] = 0;
      }

      this.lineRates = lineRates;
      this.updateRates(prod, cons, simDt);
      this.stats.totalProduced += U.sum(prod);
      this.stats.totalConsumed += U.sum(cons);
    }

    updateRates(prod, cons, simDt) {
      const alpha = 1 - Math.exp(-simDt / 1.2);
      for (const id of ITEM_IDS) {
        const r = this.rates[id] || (this.rates[id] = { prod: 0, cons: 0 });
        const p = (prod[id] || 0) / simDt;
        const c = (cons[id] || 0) / simDt;
        r.prod += (p - r.prod) * alpha;
        r.cons += (c - r.cons) * alpha;
        if (r.prod < 1e-7) r.prod = 0;
        if (r.cons < 1e-7) r.cons = 0;
      }
    }

    nominalRatesFor(id) {
      let prod = 0;
      let cons = 0;
      for (const r of D.RECIPES) {
        const count = this.lines[r.id] || 0;
        if (!count || !this.unlocked.recipes.has(r.id)) continue;
        const speed = count * this.effects.prodMult / r.time *
          (r.extraction ? this.effects.extractMult : 1);
        if (r.outputs[id]) prod += speed * r.outputs[id];
        if (r.inputs && r.inputs[id]) cons += speed * r.inputs[id];
      }
      return { prod, cons };
    }

    getItemStats(id) {
      const actual = this.rates[id] || { prod: 0, cons: 0 };
      const nominal = this.nominalRatesFor(id);
      const item = D.ITEMS[id];
      const manual = item && this.isGatherable(id) ? item.gather * this.effects.clickMult : 0;
      return {
        actual: { prod: actual.prod, cons: actual.cons },
        nominal,
        balance: actual.prod - actual.cons,
        nominalBalance: nominal.prod - nominal.cons,
        manual,
        utilization: nominal.prod > 0 ? Math.min(1, actual.prod / nominal.prod) : 1
      };
    }

    getItemRecipes(id) {
      return D.RECIPES.filter(r =>
        this.unlocked.recipes.has(r.id) && r.outputs && r.outputs[id] > 0
      ).sort((a, b) => {
        const aa = a.id.indexOf("alternate") === 0 ? 1 : 0;
        const bb = b.id.indexOf("alternate") === 0 ? 1 : 0;
        return aa - bb || a.id.localeCompare(b.id);
      });
    }

    getItemUses(id) {
      return D.RECIPES.filter(r =>
        this.unlocked.recipes.has(r.id) && r.inputs && r.inputs[id] > 0
      );
    }

    getTechsUsingItem(id) {
      return D.TECH.filter(t => t.cost && t.cost[id] > 0);
    }

    totalItems() {
      return U.sum(this.items);
    }

    getTopItems(n) {
      return Object.entries(this.items)
        .filter(([id, qty]) => qty > 0.01 && this.isKnown(id))
        .sort((a, b) => b[1] - a[1])
        .slice(0, n || 6)
        .map(([id, qty]) => ({ id, qty, item: D.ITEMS[id] }));
    }

    /* ── Технологии ────────────────────────────────────── */
    maxTechTier() {
      let max = 0;
      for (const id of this.techs) {
        const t = D.TECH_BY_ID[id];
        if (t && t.tier > max) max = t.tier;
      }
      return max;
    }

    getTechCost(id) {
      const t = D.TECH_BY_ID[id];
      if (!t) return [];
      return Object.entries(t.cost || {}).map(([itemId, need]) => ({
        itemId,
        need,
        have: this.items[itemId] || 0,
        ok: (this.items[itemId] || 0) + 1e-9 >= need
      }));
    }

    canResearch(id) {
      const t = D.TECH_BY_ID[id];
      if (!t) return { ok: false, reason: "unknown" };
      if (this.techs.includes(id)) return { ok: false, reason: "researched", tech: t };
      const missingTechs = (t.requires || []).filter(req => !this.techs.includes(req));
      if (missingTechs.length) return { ok: false, reason: "requires", tech: t, missingTechs };
      const cost = this.getTechCost(id);
      if (cost.some(c => !c.ok)) return { ok: false, reason: "cost", tech: t, cost };
      return { ok: true, tech: t, cost };
    }

    research(id) {
      const check = this.canResearch(id);
      if (!check.ok) return check;
      const t = check.tech;
      this.pay(t.cost || {});
      this.techs.push(id);
      this.stats.techsResearched = this.techs.length;
      const reward = t.crystals || 0;
      this.crystals += reward;
      this.stats.crystalsEarned += reward;
      this.rebuildUnlocks();
      this.checkAchievements();
      this.emit("tech", { tech: t, reward });
      return { ok: true, tech: t, reward, victory: !!t.victory };
    }

    getAvailableTechs() {
      return D.TECH
        .filter(t => !this.techs.includes(t.id) && this.canResearch(t.id).ok)
        .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
    }

    getNextTech() {
      const available = this.getAvailableTechs();
      if (available.length) return available[0];
      return D.TECH.filter(t => !this.techs.includes(t.id))
        .sort((a, b) => a.tier - b.tier)[0] || null;
    }

    /* ── Ускорение и кристаллы ─────────────────────────── */
    isBoostActive() {
      return this.boostUntil > Date.now();
    }

    boostRemaining() {
      return Math.max(0, (this.boostUntil - Date.now()) / 1000);
    }

    buyBoost() {
      if (this.crystals < BOOST_COST) return { ok: false, reason: "crystals" };
      this.crystals -= BOOST_COST;
      this.boostUntil = Math.max(Date.now(), this.boostUntil) + BOOST_MS;
      this.stats.boostsBought += 1;
      this.checkAchievements();
      this.emit("boost", { until: this.boostUntil });
      return { ok: true, until: this.boostUntil };
    }

    isClickBoostActive() {
      return this.clickBoostUntil > Date.now();
    }

    clickBoostRemaining() {
      return Math.max(0, (this.clickBoostUntil - Date.now()) / 1000);
    }

    buyClickBoost() {
      if (this.crystals < CLICK_BOOST_COST) return { ok: false, reason: "crystals" };
      this.crystals -= CLICK_BOOST_COST;
      this.clickBoostUntil = Math.max(Date.now(), this.clickBoostUntil) + CLICK_BOOST_MS;
      this.emit("clickBoost", { until: this.clickBoostUntil });
      return { ok: true, until: this.clickBoostUntil };
    }

    /* ── Уведомления вкладок ───────────────────────────── */
    markRecipesSeen() {
      this.seenRecipes = Array.from(this.unlocked.recipes);
    }

    getNewRecipeCount() {
      const seen = new Set(this.seenRecipes || []);
      let count = 0;
      for (const rid of this.unlocked.recipes) if (!seen.has(rid)) count += 1;
      return count;
    }

    markAchievementsSeen() {
      this.seenAchievements = this.achievements.slice();
    }

    getNewAchievementCount() {
      const seen = new Set(this.seenAchievements || []);
      let count = 0;
      for (const id of this.achievements) if (!seen.has(id)) count += 1;
      return count;
    }

    getStarvedLineCount() {
      let count = 0;
      for (const [rid, amount] of Object.entries(this.lines)) {
        if (!amount) continue;
        const info = this.lineRates[rid];
        if (!info || (info.utilization || 0) < 0.15) count += 1;
      }
      return count;
    }

    /* ── Достижения ────────────────────────────────────── */
    checkAchievements() {
      const unlocked = [];
      for (const a of D.ACHIEVEMENTS || []) {
        if (this.achievements.includes(a.id)) continue;
        let value = 0;
        try { value = a.get(this) || 0; } catch (e) { value = 0; }
        if (value >= a.goal) {
          this.achievements.push(a.id);
          this.crystals += a.crystals;
          this.stats.crystalsEarned += a.crystals;
          unlocked.push(a);
          this.emit("achievement", { achievement: a });
        }
      }
      return unlocked;
    }

    achievementProgress(a) {
      let value = 0;
      try { value = a.get(this) || 0; } catch (e) { value = 0; }
      return { value: Math.min(value, a.goal), goal: a.goal, done: this.achievements.includes(a.id) };
    }

    /* ── События для интерфейса ────────────────────────── */
    emit(type, payload) {
      this.events.push(Object.assign({ type, at: Date.now() }, payload || {}));
      if (this.events.length > 100) this.events.shift();
    }

    drainEvents() {
      const out = this.events;
      this.events = [];
      return out;
    }

    /* ── Время и офлайн ────────────────────────────────── */
    tick(now) {
      if (!this.lastTick) {
        this.lastTick = now;
        return;
      }
      let dt = (now - this.lastTick) / 1000;
      this.lastTick = now;
      if (!Number.isFinite(dt) || dt < 0) return;
      if (dt > 10) {
        let left = Math.min(dt, MAX_OFFLINE);
        while (left > 0) {
          const d = Math.min(30, left);
          this.step(d, true);
          left -= d;
        }
      } else {
        this.step(dt);
      }
      this.stats.playTime += Math.min(dt, MAX_OFFLINE);

      this._historyTimer += dt;
      if (this._historyTimer >= 5) {
        this._historyTimer = 0;
        this.pushHistory();
      }
      this._achievementTimer += dt;
      if (this._achievementTimer >= 2) {
        this._achievementTimer = 0;
        this.checkAchievements();
      }
    }

    pushHistory() {
      this.history.push({ t: Date.now(), total: this.totalItems() });
      if (this.history.length > 240) this.history.splice(0, this.history.length - 240);
    }

    simulateOffline(seconds) {
      const requested = Math.max(0, Number(seconds) || 0);
      const capped = Math.min(requested, MAX_OFFLINE);
      const before = {};
      ITEM_IDS.forEach(id => { before[id] = this.items[id] || 0; });

      if (capped > 0) {
        const chunk = 20;
        const steps = Math.max(1, Math.ceil(capped / chunk));
        const dt = capped / steps;
        for (let i = 0; i < steps; i += 1) this.step(dt, true);
        this.stats.offlineSeconds += capped;
      }

      this.lastTick = 0;
      const gains = [];
      for (const id of ITEM_IDS) {
        const diff = (this.items[id] || 0) - before[id];
        if (diff > 0.001) gains.push({ id, amount: diff });
      }
      gains.sort((a, b) => b.amount - a.amount);
      this.pushHistory();
      this.checkAchievements();

      return {
        ok: true,
        requested,
        seconds: capped,
        capped: requested > MAX_OFFLINE + 1,
        gains,
        top: gains.slice(0, 12)
      };
    }

    /* ── Сохранения ────────────────────────────────────── */
    serialize() {
      const items = {};
      for (const [id, qty] of Object.entries(this.items)) {
        if (qty > 0.000001 && D.ITEMS[id]) items[id] = Number(qty.toFixed(6));
      }
      const stats = Object.assign({}, this.stats);
      delete stats.sessionStart;
      return JSON.stringify({
        app: "cor",
        version: VERSION,
        savedAt: Date.now(),
        createdAt: this.createdAt,
        items,
        lines: this.lines,
        techs: this.techs,
        crystals: Math.floor(this.crystals),
        boostUntil: this.boostUntil,
        clickBoostUntil: this.clickBoostUntil,
        stats,
        settings: this.settings,
        achievements: this.achievements,
        seenAchievements: this.seenAchievements,
        seenRecipes: this.seenRecipes,
        history: this.history.slice(-200),
        selectedItem: this.selectedItem
      });
    }

    save() {
      try {
        const str = this.serialize();
        window.localStorage.setItem(SAVE_KEY, str);
        this.lastSave = Date.now();
        return { ok: true, size: str.length };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    }

    loadFromStorage() {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw) return { ok: false, reason: "empty" };
        return this.loadString(raw);
      } catch (e) {
        return { ok: false, reason: "storage", error: e && e.message };
      }
    }

    loadString(str) {
      let obj;
      try { obj = JSON.parse(str); } catch (e) { return { ok: false, reason: "json" }; }
      if (!obj || typeof obj !== "object") return { ok: false, reason: "format" };

      this.reset();
      this.settings = {
        sound: obj.settings ? obj.settings.sound !== false : true,
        particles: obj.settings ? obj.settings.particles !== false : true
      };

      this.createdAt = Number.isFinite(obj.createdAt) ? obj.createdAt : Date.now();
      this.crystals = Math.max(0, Math.floor(Number(obj.crystals) || 0));
      this.boostUntil = Math.max(0, Number(obj.boostUntil) || 0);
      this.clickBoostUntil = Math.max(0, Number(obj.clickBoostUntil) || 0);

      const techs = Array.isArray(obj.techs) ? obj.techs : [];
      this.techs = Array.from(new Set(techs.filter(id => D.TECH_BY_ID[id])));

      this.items = {};
      ITEM_IDS.forEach(id => { this.items[id] = 0; });
      if (obj.items && typeof obj.items === "object") {
        for (const [id, qty] of Object.entries(obj.items)) {
          if (!D.ITEMS[id]) continue;
          const v = Number(qty);
          if (Number.isFinite(v) && v > 0) this.items[id] = v;
        }
      }

      this.lines = {};
      if (obj.lines && typeof obj.lines === "object") {
        for (const [rid, count] of Object.entries(obj.lines)) {
          if (!RECIPE_BY_ID[rid]) continue;
          const n = Math.floor(Number(count));
          if (Number.isFinite(n) && n > 0) this.lines[rid] = Math.min(n, 1000000);
        }
      }

      this.achievements = Array.isArray(obj.achievements)
        ? Array.from(new Set(obj.achievements.filter(id => (D.ACHIEVEMENTS || []).some(a => a.id === id))))
        : [];

      this.history = Array.isArray(obj.history)
        ? obj.history.filter(p => p && Number.isFinite(p.t) && Number.isFinite(p.total)).slice(-200)
        : [];

      if (obj.stats && typeof obj.stats === "object") {
        for (const key of Object.keys(STAT_DEFAULTS)) {
          if (key === "machineTypes") continue;
          const v = Number(obj.stats[key]);
          if (Number.isFinite(v) && v >= 0) this.stats[key] = v;
        }
        if (Array.isArray(obj.stats.machineTypes)) {
          this.stats.machineTypes = obj.stats.machineTypes.filter(m => D.MACHINES[m]);
        }
      }
      this.stats.sessionStart = Date.now();
      this.stats.startedAt = this.stats.startedAt || this.createdAt;
      this.stats.techsResearched = this.techs.length;

      this.settings.sound = obj.settings ? obj.settings.sound !== false : true;
      this.settings.particles = obj.settings ? obj.settings.particles !== false : true;

      this.rebuildUnlocks();

      const unlockedRecipes = new Set(this.unlocked.recipes);
      this.seenRecipes = Array.isArray(obj.seenRecipes)
        ? Array.from(new Set(obj.seenRecipes.filter(id => unlockedRecipes.has(id))))
        : Array.from(this.unlocked.recipes);
      const achievementIds = new Set(this.achievements);
      this.seenAchievements = Array.isArray(obj.seenAchievements)
        ? Array.from(new Set(obj.seenAchievements.filter(id => achievementIds.has(id))))
        : this.achievements.slice();

      if (this.stats.machineTypes.length === 0) {
        this.stats.machineTypes = Array.from(new Set(
          Object.keys(this.lines).map(rid => RECIPE_BY_ID[rid].machine)
        ));
      }

      this.selectedItem = obj.selectedItem && D.ITEMS[obj.selectedItem] ? obj.selectedItem : null;

      const savedAt = Number.isFinite(obj.savedAt) ? obj.savedAt : Date.now();
      const elapsed = Math.max(0, (Date.now() - savedAt) / 1000);
      this.lastTick = 0;
      this.lastSave = Date.now();
      this._historyTimer = 0;
      this._achievementTimer = 0;

      return { ok: true, elapsed, savedAt, version: obj.version || 0 };
    }

    hardReset() {
      try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      this.reset();
      this.lastTick = 0;
      return true;
    }
  }

  Game.SAVE_KEY = SAVE_KEY;
  Game.VERSION = VERSION;
  Game.MAX_OFFLINE = MAX_OFFLINE;
  Game.BOOST_COST = BOOST_COST;
  Game.BOOST_MS = BOOST_MS;
  Game.CLICK_BOOST_COST = CLICK_BOOST_COST;
  Game.CLICK_BOOST_MS = CLICK_BOOST_MS;

  window.COR.Game = Game;
})();
