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
  document: { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, removeChild() {}, select() {} }), body: { appendChild() {}, removeChild() {} }, execCommand: () => true },
  console
};
vm.createContext(ctx);

for (const file of [
  "js/util.js", "data/items.js", "data/buildings.js", "data/recipes.js",
  "data/techTree.js", "data/achievements.js", "js/engine.js"
]) {
  const full = path.join(root, file);
  vm.runInContext(fs.readFileSync(full, "utf8"), ctx, { filename: full });
}

const Game = ctx.window.COR.Game;
const g = new Game();
const assert = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); console.log("ok — " + msg); };

assert(g.items.ironOre === 0, "стартовый склад пуст");
assert(g.isGatherable("ironOre"), "железо добывается вручную");
assert(!g.isGatherable("cateriumOre"), "катерий закрыт");

for (let i = 0; i < 10; i++) g.gather("ironOre");
assert(g.items.ironOre === 10, "10 кликов дают 10 руды");
for (let i = 0; i < 10; i++) {
  const r = g.craftManual("ironIngot");
  assert(r.ok, "ручная плавка железа " + (i + 1));
}
for (let i = 0; i < 5; i++) g.gather("copperOre");
for (let i = 0; i < 5; i++) g.craftManual("copperIngot");
for (let i = 0; i < 15; i++) g.gather("limestone");
for (let i = 0; i < 5; i++) g.craftManual("concrete");
assert(g.items.ironIngot === 10 && g.items.copperIngot === 5 && g.items.concrete === 5, "накоплен стартовый комплект");

/* Стоимость технологий увеличена в 10 раз — добираем ресурсы для проверки. */
g.items.ironIngot += 90;
g.items.copperIngot += 45;
g.items.concrete += 45;

const check = g.canResearch("t1_metal");
assert(check.ok, "технология «Первый металл» доступна");
const res = g.research("t1_metal");
assert(res.ok, "технология исследована");
assert(g.unlocked.machines.has("smelter"), "плавильня открыта");
assert(g.unlocked.recipes.has("ironPlate"), "железная пластина открыта");
assert(g.crystals >= 2, "кристаллы начислены");

g.items.ironIngot += 20;
g.items.concrete += 20;
const build = g.addMachines("ironIngot", 1);
assert(build.ok && g.lines.ironIngot === 1, "плавильня построена");
assert(g.ownedOfType("smelter") === 1, "учёт зданий по типу");
const baseSmelterCost = g.machineCost("smelter");
assert(baseSmelterCost.ironIngot === 4 && baseSmelterCost.concrete === 2, "стоимость здания фиксированная");

g.items.ironOre += 100;
const before = g.items.ironIngot;
for (let i = 0; i < 20; i++) g.step(0.5, false);
assert(g.items.ironIngot > before, "автоматическая плавка идёт");
assert(g.rates.ironIngot.prod > 0, "ставка производства рассчитана");

const save = g.save();
assert(save.ok, "сохранение в localStorage");
const g2 = new Game();
const loaded = g2.loadFromStorage();
assert(loaded.ok, "загрузка сохранения");
assert(g2.lines.ironIngot === 1 && g2.techs.includes("t1_metal"), "здания и технологии восстановлены");
assert(g2.items.ironIngot >= g.items.ironIngot - 1, "склад восстановлен");

const offline = g2.simulateOffline(3600);
assert(offline.ok && offline.seconds === 3600, "офлайн-прогноз на час");
console.log("offline gains:", offline.top.slice(0, 3).map(x => x.id + " " + x.amount.toFixed(1)).join(", "));

const capped = g2.simulateOffline(12 * 3600);
assert(capped.seconds === 8 * 3600 && capped.capped, "офлайн ограничен 8 часами");

const exportStr = g2.serialize();
const g3 = new Game();
assert(g3.loadString(exportStr).ok, "импорт строки сейва");
assert(g3.totalBuildings() === g2.totalBuildings(), "импорт сохраняет здания");

/* Регрессия: machine id "constructor" не должен читать Object.prototype.constructor. */
const g4 = new Game();
g4.lines = { ironPlate: 1, ironRod: 2 };
const constructorGroups = g4.getMachineGroups();
assert(constructorGroups.length === 1, "группировка зданий возвращает одну группу конструктора");
assert(constructorGroups[0].type === "constructor", "тип группы — constructor");
assert(constructorGroups[0].lines.length === 2 && constructorGroups[0].count === 3, "линии конструктора сгруппированы без потерь");

console.log("\nДвижок работает.");
