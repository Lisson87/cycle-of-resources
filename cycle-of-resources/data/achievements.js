/* Цикл ресурсов — достижения. get(game) возвращает текущий прогресс. */
(function () {
  const D = window.COR.DATA;
  D.ACHIEVEMENTS = [
    {
      id: "first_click", title: "Первый удар", icon: "⛏️", crystals: 1, goal: 1,
      desc: "Добудьте первую единицу сырья вручную.",
      get: g => g.stats.clicks
    },
    {
      id: "clicks_100", title: "Рудокоп", icon: "🪨", crystals: 2, goal: 100,
      desc: "Сделайте 100 ручных кликов.",
      get: g => g.stats.clicks
    },
    {
      id: "clicks_1000", title: "Мозолистые руки", icon: "🤝", crystals: 5, goal: 1000,
      desc: "Сделайте 1 000 ручных кликов.",
      get: g => g.stats.clicks
    },
    {
      id: "first_build", title: "Первая машина", icon: "🔩", crystals: 2, goal: 1,
      desc: "Постройте первое здание.",
      get: g => g.stats.buildingsBuilt
    },
    {
      id: "build_10", title: "Малая серия", icon: "🏗️", crystals: 3, goal: 10,
      desc: "Постройте 10 зданий.",
      get: g => g.stats.buildingsBuilt
    },
    {
      id: "build_50", title: "Промышленник", icon: "🏭", crystals: 6, goal: 50,
      desc: "Постройте 50 зданий.",
      get: g => g.stats.buildingsBuilt
    },
    {
      id: "first_tech", title: "Не по учебнику", icon: "💡", crystals: 2, goal: 1,
      desc: "Исследуйте первую технологию.",
      get: g => g.techs.length
    },
    {
      id: "tech_10", title: "Инженер", icon: "📐", crystals: 5, goal: 10,
      desc: "Исследуйте 10 технологий.",
      get: g => g.techs.length
    },
    {
      id: "tech_all", title: "Полный цикл", icon: "♾️", crystals: 20, goal: D.TECH.length,
      desc: "Исследуйте все технологии дерева.",
      get: g => g.techs.length
    },
    {
      id: "tier_3", title: "Средний передел", icon: "⚙️", crystals: 3, goal: 3,
      desc: "Дойдите до технологий 3 уровня.",
      get: g => g.maxTechTier()
    },
    {
      id: "tier_5", title: "Высокие технологии", icon: "🛰️", crystals: 5, goal: 5,
      desc: "Дойдите до технологий 5 уровня.",
      get: g => g.maxTechTier()
    },
    {
      id: "tier_7", title: "Экзотика", icon: "⚛️", crystals: 8, goal: 7,
      desc: "Дойдите до технологий 7 уровня.",
      get: g => g.maxTechTier()
    },
    {
      id: "tier_9", title: "Предел", icon: "🌠", crystals: 15, goal: 9,
      desc: "Дойдите до технологий 9 уровня.",
      get: g => g.maxTechTier()
    },
    {
      id: "million", title: "Миллионник", icon: "💰", crystals: 8, goal: 1e6,
      desc: "Накопите 1 000 000 единиц любого предмета.",
      get: g => {
        let max = 0;
        for (const v of Object.values(g.items)) if (v > max) max = v;
        return max;
      }
    },
    {
      id: "machines_all", title: "Все профессии", icon: "🧰", crystals: 10, goal: Object.keys(D.MACHINES).length,
      desc: "Постройте хотя бы по одному зданию каждого типа.",
      get: g => (g.stats.machineTypes || []).length
    },
    {
      id: "offline_8h", title: "Ночная смена", icon: "🌙", crystals: 8, goal: 8 * 3600,
      desc: "Соберите 8 часов офлайн-прогресса.",
      get: g => g.stats.offlineSeconds
    },
    {
      id: "play_hour", title: "Первая смена", icon: "⏱️", crystals: 3, goal: 3600,
      desc: "Проведите в игре один час.",
      get: g => g.stats.playTime
    },
    {
      id: "play_day", title: "Круглосуточный завод", icon: "🗓️", crystals: 10, goal: 86400,
      desc: "Проведите в игре 24 часа.",
      get: g => g.stats.playTime
    },
    {
      id: "crystals_50", title: "Кристальный фонд", icon: "💠", crystals: 5, goal: 50,
      desc: "Заработайте 50 кристаллов.",
      get: g => g.stats.crystalsEarned
    },
    {
      id: "boost_first", title: "Турборежим", icon: "⚡", crystals: 2, goal: 1,
      desc: "Купите ускорение ×2 впервые.",
      get: g => g.stats.boostsBought
    },
    {
      id: "rocket_built", title: "Ракета собрана", icon: "🚀", crystals: 50, goal: 1,
      desc: "Завершите финальный проект «Строительство ракеты».",
      get: g => (g.techs.includes("t9_rocket") ? 1 : 0)
    }
  ];
})();
