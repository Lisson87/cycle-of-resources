const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const storage = new Map();
const ctx = {
  window: {
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    },
    matchMedia: () => ({ matches: false })
  },
  navigator: {},
  Blob: class {},
  URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  document: {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, removeChild() {}, select() {} }),
    body: { appendChild() {}, removeChild() {} },
    execCommand: () => true
  },
  console
};
vm.createContext(ctx);
for (const file of [
  "js/util.js", "data/items.js", "data/buildings.js", "data/recipes.js",
  "data/techTree.js", "data/achievements.js", "js/engine.js"
]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), ctx, { filename: file });
}

const Game = ctx.window.COR.Game;
const D = ctx.window.COR.DATA;
const g = new Game();
let failures = 0;
const assert = (cond, msg) => {
  if (!cond) { failures += 1; console.log("FAIL — " + msg); }
  else console.log("ok — " + msg);
};

for (const id of Object.keys(D.ITEMS)) g.items[id] = 1e9;

for (const t of D.TECH) {
  const check = g.canResearch(t.id);
  assert(check.ok, `доступна технология ${t.id}`);
  const res = g.research(t.id);
  assert(res.ok, `исследована ${t.id}`);
}

assert(g.techs.length === D.TECH.length, `исследованы все ${D.TECH.length} технологий`);
assert(g.unlocked.machines.size === Object.keys(D.MACHINES).length, "открыты все машины");
assert(g.unlocked.recipes.size === D.RECIPES.length, "открыты все рецепты");

const known = Object.keys(D.ITEMS).filter(id => g.isKnown(id));
assert(known.length === Object.keys(D.ITEMS).length, `известны все ${known.length} предметов`);

/* Ставим по одной линии на каждый рецепт и крутим производство. */
for (const r of D.RECIPES) g.lines[r.id] = 1;
g.rebuildUnlocks();
for (let i = 0; i < 120; i += 1) g.step(1, false);

let finite = true;
let negative = 0;
for (const [id, qty] of Object.entries(g.items)) {
  if (!Number.isFinite(qty)) { finite = false; console.log("NaN/Infinity:", id); }
  if (qty < -1e-6) { negative += 1; console.log("negative:", id, qty); }
}
assert(finite, "после 120 секунд все количества конечны");
assert(negative === 0, "нет отрицательного склада");
assert(g.stats.totalProduced > 0, "производство накопило выпуск");
assert(Object.values(g.rates).some(r => r.prod > 0 || r.cons > 0), "рассчитаны ставки");

const line = D.RECIPES.find(r => r.id === "ironIngot");
g.items.ironIngot += 1000;
g.items.concrete += 1000;
const add = g.addMachines("ironIngot", 3);
assert(add.ok && add.built === 3, "пакетная постройка трёх плавилен");
const remove = g.removeMachines("ironIngot", 2);
assert(remove.ok && remove.removed === 2, "снятие двух плавилен");

const off = g.simulateOffline(12 * 3600);
assert(off.seconds === 8 * 3600 && off.capped, "офлайн ограничен 8 часами");
assert(off.gains.length > 0, "офлайн приносит ресурсы");

g.checkAchievements();
const expectedAch = ["first_tech", "tech_10", "tech_all", "tier_3", "tier_5", "tier_7", "tier_9", "million", "machines_all", "offline_8h", "crystals_50", "rocket_built"];
for (const id of expectedAch) {
  assert(g.achievements.includes(id), `достижение ${id} открыто`);
}

if (g.crystals >= 5) {
  const boost = g.buyBoost();
  assert(boost.ok && g.isBoostActive(), "ускорение покупается");
  assert(g.achievements.includes("boost_first"), "достижение за первое ускорение открыто");
}
g.step(5, false);
assert(Number.isFinite(g.items.ironIngot), "ускорение не ломает экономику");

const save = g.save();
assert(save.ok, "сохранение полного завода");
const g2 = new Game();
const loaded = g2.loadFromStorage();
assert(loaded.ok, "загрузка полного завода");
assert(g2.techs.length === D.TECH.length, "технологии восстановлены");
assert(Object.keys(g2.lines).length > 100, "линии восстановлены");
assert(g2.achievements.length === g.achievements.length, "достижения восстановлены");

const exported = g2.serialize();
const g3 = new Game();
const imported = g3.loadString(exported);
assert(imported.ok, "импорт JSON");
assert(g3.totalBuildings() === g2.totalBuildings(), "импорт сохраняет здания");

/* Удаление всех линий не должно ломать шаг. */
for (const rid of Object.keys(g.lines)) g.removeMachines(rid, g.lines[rid]);
g.step(1, false);
assert(g.totalBuildings() === 0, "все линии сняты");
assert(Number.isFinite(g.items.ironIngot), "пустой завод считает тик");

console.log(`\nТехнологий: ${g.techs.length}, рецептов открыто: ${g.unlocked.recipes.size}, достижений: ${g.achievements.length}`);
if (failures) {
  console.log(`\nПровалов: ${failures}`);
  process.exitCode = 1;
} else {
  console.log("\nСимуляция полного завода пройдена.");
}
