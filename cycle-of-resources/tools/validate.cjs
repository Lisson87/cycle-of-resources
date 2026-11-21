const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const ctx = { window: {} };
vm.createContext(ctx);

for (const file of ["data/items.js", "data/buildings.js", "data/recipes.js", "data/techTree.js"]) {
  const full = path.join(root, file);
  vm.runInContext(fs.readFileSync(full, "utf8"), ctx, { filename: full });
}

const D = ctx.window.COR.DATA;
const ITEMS = D.ITEMS;
const MACHINES = D.MACHINES;
const RECIPES = D.RECIPES;
const TECH = D.TECH;
const START = D.START;

const errors = [];
const warnings = [];
const itemIds = new Set(Object.keys(ITEMS));
const machineIds = new Set(Object.keys(MACHINES));
const recipeIds = new Set();
const recipeById = {};

const err = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/* ── Предметы ───────────────────────────────────────────── */
const kinds = new Set(["raw", "ingot", "material", "part"]);
for (const [id, item] of Object.entries(ITEMS)) {
  if (!item.name) err(`ITEM ${id}: нет name`);
  if (!item.icon) err(`ITEM ${id}: нет icon`);
  if (!kinds.has(item.kind)) err(`ITEM ${id}: неизвестный kind "${item.kind}"`);
  if (item.gather != null && (!(item.gather > 0) || !Number.isFinite(item.gather))) err(`ITEM ${id}: плохой gather`);
}

/* ── Рецепты ────────────────────────────────────────────── */
for (const r of RECIPES) {
  if (recipeIds.has(r.id)) err(`RECIPE ${r.id}: дубликат id`);
  recipeIds.add(r.id);
  recipeById[r.id] = r;

  if (!r.name) err(`RECIPE ${r.id}: нет name`);
  if (!machineIds.has(r.machine)) err(`RECIPE ${r.id}: машина "${r.machine}" отсутствует в buildings.js`);
  if (!(r.time > 0)) err(`RECIPE ${r.id}: time должен быть > 0`);
  if (!r.outputs || !Object.keys(r.outputs).length) err(`RECIPE ${r.id}: нет outputs`);

  for (const side of ["inputs", "outputs"]) {
    const obj = r[side] || {};
    for (const [item, qty] of Object.entries(obj)) {
      if (!itemIds.has(item)) err(`RECIPE ${r.id}: ${side} ссылается на неизвестный предмет "${item}"`);
      if (!(qty > 0) || !Number.isFinite(qty)) err(`RECIPE ${r.id}: ${side}.${item} должен быть > 0`);
    }
  }
  if (r.extraction && Object.keys(r.inputs || {}).length) err(`RECIPE ${r.id}: extraction не должен иметь inputs`);
}

const usedMachines = new Set(RECIPES.map(r => r.machine));
for (const id of machineIds) {
  if (!usedMachines.has(id)) warn(`MACHINE ${id}: не используется ни в одном рецепте`);
}
for (const [id, m] of Object.entries(MACHINES)) {
  if (!m.name || !m.icon) err(`MACHINE ${id}: нет name/icon`);
  for (const [item, qty] of Object.entries(m.cost || {})) {
    if (!itemIds.has(item)) err(`MACHINE ${id}: cost ссылается на неизвестный предмет "${item}"`);
    if (!(qty > 0)) err(`MACHINE ${id}: cost.${item} должен быть > 0`);
  }
}

/* ── Технологии ─────────────────────────────────────────── */
const techIds = new Set();
const tierCount = {};
for (const t of TECH) {
  if (techIds.has(t.id)) err(`TECH ${t.id}: дубликат id`);
  techIds.add(t.id);
  tierCount[t.tier] = (tierCount[t.tier] || 0) + 1;
  if (t.tier < 1 || t.tier > 9) err(`TECH ${t.id}: tier должен быть 1..9`);
  if (!t.title || !t.description) err(`TECH ${t.id}: нет title/description`);
  if (!t.unlocks) err(`TECH ${t.id}: нет unlocks`);
  for (const [item, qty] of Object.entries(t.cost || {})) {
    if (!itemIds.has(item)) err(`TECH ${t.id}: cost ссылается на неизвестный предмет "${item}"`);
    if (!(qty > 0)) err(`TECH ${t.id}: cost.${item} должен быть > 0`);
  }
  for (const m of t.unlocks.machines || []) if (!machineIds.has(m)) err(`TECH ${t.id}: неизвестная машина "${m}"`);
  for (const res of t.unlocks.resources || []) {
    if (!itemIds.has(res)) err(`TECH ${t.id}: неизвестный ресурс "${res}"`);
    else if (!ITEMS[res].gather) err(`TECH ${t.id}: ресурс "${res}" не имеет gather и не добывается вручную`);
  }
  for (const r of t.unlocks.recipes || []) if (!recipeIds.has(r)) err(`TECH ${t.id}: неизвестный рецепт "${r}"`);
}

for (const t of TECH) {
  for (const req of t.requires || []) {
    if (!techIds.has(req)) { err(`TECH ${t.id}: requires неизвестной "${req}"`); continue; }
    const rt = TECH.find(x => x.id === req);
    if (rt.tier > t.tier) err(`TECH ${t.id}: требует технологию более высокого уровня "${req}"`);
    if (rt.tier === t.tier && TECH.indexOf(rt) > TECH.indexOf(t)) err(`TECH ${t.id}: внутриуровневая зависимость "${req}" должна идти раньше`);
  }
}

const visiting = new Set(), visited = new Set();
function dfs(id, chain) {
  if (visiting.has(id)) { err(`TECH: цикл зависимостей ${chain.concat(id).join(" → ")}`); return; }
  if (visited.has(id)) return;
  visiting.add(id);
  const t = D.TECH_BY_ID[id];
  for (const req of t.requires || []) dfs(req, chain.concat(id));
  visiting.delete(id);
  visited.add(id);
}
TECH.forEach(t => dfs(t.id, []));

for (let tier = 1; tier <= 9; tier++) {
  if (!tierCount[tier] || tierCount[tier] < 2) err(`TECH: на уровне ${tier} меньше двух технологий`);
}

/* ── Покрытие рецептов ──────────────────────────────────── */
const assigned = new Map();
const assign = (rid, source) => {
  if (!recipeIds.has(rid)) { err(`${source}: неизвестный рецепт "${rid}"`); return; }
  if (assigned.has(rid)) err(`RECIPE ${rid}: назначен дважды (${assigned.get(rid)} и ${source})`);
  else assigned.set(rid, source);
};
(START.recipes || []).forEach(rid => assign(rid, "START"));
for (const t of TECH) for (const rid of t.unlocks.recipes || []) assign(rid, t.id);

const missing = [...recipeIds].filter(id => !assigned.has(id));
for (const rid of missing) err(`RECIPE ${rid}: не открывается ни стартом, ни технологией`);
if (missing.length) err(`Всего нераспределённых рецептов: ${missing.length}`);

/* ── Покрытие машин и ресурсов ──────────────────────────── */
const unlockedMachines = new Set(START.machines || []);
const unlockedResources = new Set(START.resources || []);
for (const t of TECH) {
  (t.unlocks.machines || []).forEach(m => unlockedMachines.add(m));
  (t.unlocks.resources || []).forEach(r => unlockedResources.add(r));
}
for (const id of machineIds) {
  if (!unlockedMachines.has(id)) err(`MACHINE ${id}: не открывается ни одной технологией`);
}
for (const [id, item] of Object.entries(ITEMS)) {
  if (item.gather && !unlockedResources.has(id)) err(`ITEM ${id}: добывается вручную, но ресурс не открыт`);
}

/* ── Источники предметов ────────────────────────────────── */
const produced = new Set();
for (const r of RECIPES) for (const id of Object.keys(r.outputs)) produced.add(id);
for (const [id, item] of Object.entries(ITEMS)) {
  const gatherable = item.gather && unlockedResources.has(id);
  if (!produced.has(id) && !gatherable) {
    err(`ITEM ${id}: нет источника — ни рецепта, ни ручной добычи`);
  }
}

/* ── Отчёт ──────────────────────────────────────────────── */
const lines = [];
lines.push(`Предметов: ${itemIds.size}`);
lines.push(`Машин: ${machineIds.size}`);
lines.push(`Рецептов: ${recipeIds.size} (распределено ${assigned.size})`);
lines.push(`Технологий: ${TECH.length}`);
lines.push(`По уровням: ${Array.from({ length: 9 }, (_, i) => `L${i + 1}=${tierCount[i + 1] || 0}`).join(", ")}`);
const altCount = RECIPES.filter(r => r.id.startsWith("alternate")).length;
lines.push(`Альтернативных рецептов: ${altCount}`);
lines.push(`Машин открыто: ${unlockedMachines.size}/${machineIds.size}`);
lines.push(`Ресурсов для ручной добычи: ${unlockedResources.size}`);

console.log(lines.join("\n"));

if (warnings.length) {
  console.log("\nПредупреждения:");
  warnings.forEach(w => console.log("  ⚠ " + w));
}
if (errors.length) {
  console.log("\nОшибки:");
  errors.forEach(e => console.log("  ✖ " + e));
  process.exitCode = 1;
} else {
  console.log("\n✔ Проверка данных пройдена без ошибок.");
}
