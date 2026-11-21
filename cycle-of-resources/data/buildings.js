/* Цикл ресурсов — здания (машины).
   Все типы машин, встречающиеся в recipes.js, описаны здесь.
   cost — базовая стоимость первой машины; каждая следующая дороже на 15%. */
window.COR = window.COR || {};
window.COR.DATA = window.COR.DATA || {};

window.COR.DATA.MACHINES = {
  miner: {
    name: "Шахтёрский комплекс", short: "Шахта", icon: "⛏️", order: 1, tier: 1,
    category: "extraction",
    desc: "Автоматически добывает выбранную руду. Один комплекс обслуживает одну линию добычи.",
    cost: { ironIngot: 4, concrete: 2 }
  },
  waterExtractor: {
    name: "Водозабор", short: "Вода", icon: "💧", order: 2, tier: 3,
    category: "extraction",
    desc: "Качает воду из водоёма. Бесплатное сырьё для растворов и охлаждения.",
    cost: { ironPlate: 10, copperSheet: 6, concrete: 15 }
  },
  oilExtractor: {
    name: "Нефтяная вышка", short: "Нефть", icon: "🛢️", order: 3, tier: 3,
    category: "extraction",
    desc: "Поднимает сырую нефть на поверхность для переработки.",
    cost: { steelPipe: 10, reinforcedIronPlate: 4, concrete: 15 }
  },
  nitrogenWell: {
    name: "Азотная скважина", short: "Азот", icon: "💨", order: 4, tier: 6,
    category: "extraction",
    desc: "Извлекает азот из подземных пластов. Работает без сырья.",
    cost: { steelPipe: 15, computer: 2, concrete: 20 }
  },
  smelter: {
    name: "Плавильня", short: "Плавильня", icon: "🔥", order: 10, tier: 1,
    category: "production",
    desc: "Переплавляет руду в слитки. Первая машина настоящего завода.",
    cost: { ironIngot: 4, concrete: 2 }
  },
  constructor: {
    name: "Конструктор", short: "Конструктор", icon: "🔩", order: 11, tier: 1,
    category: "production",
    desc: "Вырезает, штампует и свивает простые детали из слитков.",
    cost: { ironIngot: 6, concrete: 3 }
  },
  foundry: {
    name: "Литейный цех", short: "Литейка", icon: "🏭", order: 12, tier: 2,
    category: "production",
    desc: "Сплавляет несколько компонентов. Открывает сталь и сплавы.",
    cost: { ironIngot: 8, concrete: 5 }
  },
  assembler: {
    name: "Сборщик", short: "Сборщик", icon: "⚙️", order: 13, tier: 2,
    category: "production",
    desc: "Соединяет готовые детали в узлы: роторы, рамы, обшивку.",
    cost: { ironPlate: 8, cable: 4, ironRod: 4 }
  },
  refinery: {
    name: "Нефтепереработчик", short: "НПЗ", icon: "⚗️", order: 14, tier: 3,
    category: "production",
    desc: "Разделяет нефть на пластик, резину, топливо и остатки.",
    cost: { steelPipe: 12, concrete: 25, modularFrame: 2 }
  },
  packager: {
    name: "Упаковщик", short: "Упаковка", icon: "📦", order: 15, tier: 4,
    category: "production",
    desc: "Разливает жидкости и газы в тару и распаковывает обратно.",
    cost: { steelPipe: 8, plastic: 20, cable: 10 }
  },
  manufacturer: {
    name: "Производитель", short: "Производитель", icon: "🧰", order: 16, tier: 4,
    category: "production",
    desc: "Собирает сложные компоненты из множества деталей.",
    cost: { reinforcedIronPlate: 8, steelBeam: 8, motor: 2 }
  },
  blender: {
    name: "Смеситель", short: "Смеситель", icon: "🌀", order: 17, tier: 5,
    category: "production",
    desc: "Смешивает жидкости, газы и твёрдые компоненты под давлением.",
    cost: { steelPipe: 20, motor: 4, computer: 2 }
  },
  reactor: {
    name: "Ядерный реактор", short: "Реактор", icon: "☢️", order: 18, tier: 6,
    category: "production",
    desc: "Сжигает топливные стержни и оставляет радиоактивные отходы для переработки.",
    cost: { heavyModularFrame: 2, computer: 4, concrete: 100 }
  },
  particleAccelerator: {
    name: "Ускоритель частиц", short: "Ускоритель", icon: "⚛️", order: 19, tier: 7,
    category: "production",
    desc: "Разгоняет частицы до околосветовых скоростей, создавая экзотические материалы.",
    cost: { heavyModularFrame: 4, supercomputer: 2, coolingSystem: 4 }
  },
  converter: {
    name: "Конвертер", short: "Конвертер", icon: "🔄", order: 20, tier: 8,
    category: "production",
    desc: "Перестраивает атомы с помощью СИМ, превращая обычные слитки в фиксит.",
    cost: { supercomputer: 2, heavyModularFrame: 3, samFluctuator: 2 }
  },
  quantumEncoder: {
    name: "Квантовый кодировщик", short: "Квант", icon: "🧿", order: 21, tier: 8,
    category: "production",
    desc: "Собирает объекты, существующие в нескольких состояниях одновременно.",
    cost: { supercomputer: 5, coolingSystem: 4, radioControlUnit: 4 }
  }
};
