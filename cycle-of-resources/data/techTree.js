/* Цикл ресурсов — дерево технологий: 9 уровней, 31 исследование.
   requires — предыдущие технологии (рёбра графа).
   cost — ресурсы на исследование.
   unlocks.machines / resources / recipes — что открывается.
   effect — постоянный бонус завода. */
(function () {
  const D = window.COR.DATA;

  const ALL_ALT = D.RECIPES.filter(r => r.id.indexOf("alternate") === 0).map(r => r.id);

  /* Ранние альтернативы: доступны к 4 уровню, работают на железе, меди, стали, нефти, катерии и кварце. */
  const ALT1 = [
    "alternatePureIronIngot", "alternateBasicIronIngot", "alternateIronAlloyIngot",
    "alternatePureCopperIngot", "alternateCopperAlloyIngot", "alternateTemperedCopperIngot",
    "alternateWetConcrete", "alternateRubberConcrete", "alternateFineConcrete",
    "alternateCoatedIronPlate", "alternateSteelCastPlate", "alternateSteelRod",
    "alternateSteelScrew", "alternateCastScrew", "alternateAdheredIronPlate",
    "alternateStitchedIronPlate", "alternateBoltedIronPlate", "alternateFusedWire",
    "alternateCateriumWire", "alternateIronWire", "alternateCoatedCable",
    "alternateQuickwireCable", "alternateInsulatedCable", "alternateSteamedCopperSheet",
    "alternateBoltedFrame", "alternateSteeledFrame", "alternateCopperRotor",
    "alternateSteelRotor", "alternatePlasticSmartPlating", "alternateCokeSteelIngot",
    "alternateSolidSteelIngot", "alternateMoldedBeam", "alternateMoldedSteelPipe",
    "alternateIronPipe", "alternateFlexibleFramework", "alternateEncasedIndustrialPipe",
    "alternateAutomatedSpeedWiring", "alternateQuickwireStator", "alternatePlasticAiLimiter",
    "alternateSiliconHighSpeedConnector", "alternateFusedQuickwire", "alternateSteelCanister",
    "alternateCoatedIronCanister", "alternateHeavyOilResidue", "alternatePolymerResin",
    "alternateRecycledPlastic", "alternateRecycledRubber", "alternateHeavyFlexibleFrame",
    "alternateHeavyEncasedFrame", "alternateElectrodeCircuitBoard", "alternateCateriumCircuitBoard",
    "alternateSiliconCircuitBoard", "alternateCateriumComputer", "alternatePureCateriumIngot",
    "alternateTemperedCateriumIngot", "alternatePureQuartzCrystal", "alternateFusedQuartzCrystal",
    "alternateCheapSilica", "alternateInsulatedCrystalOscillator"
  ];

  /* Поздние альтернативы: ядерный цикл, турбомашины, тёмная материя. */
  const ALT3 = [
    "alternateInstantPlutoniumCell", "alternateInfusedUraniumCell", "alternatePlutoniumFuelUnit",
    "alternateUraniumFuelUnit", "alternateFertileUranium", "alternateTurboPressureMotor",
    "alternateTurboElectricMotor", "alternateHeatFusedFrame", "alternateNitroRocketFuel",
    "alternateDarkIonFuel", "alternateDarkMatterTrap", "alternateDarkMatterCrystallization"
  ];

  /* Всё, что не попало в раннюю и позднюю группы, открывается на 5 уровне. */
  const ALT2 = ALL_ALT.filter(id => ALT1.indexOf(id) === -1 && ALT3.indexOf(id) === -1 && id !== "alternateCompactedCoal");

  D.START = {
    resources: ["ironOre", "copperOre", "limestone", "coal"],
    recipes: [
      "ironIngot", "copperIngot", "concrete",
      "mineIronOre", "mineCopperOre", "mineLimestone", "mineCoal"
    ],
    machines: []
  };

  D.TECH = [
    /* ── Уровень 1 ─────────────────────────────────────── */
    {
      id: "t1_metal", tier: 1, icon: "🔥", title: "Первый металл",
      description: "Ручная плавка даёт первые слитки. Пора заменить мозоли машинной тягой: плавильня, конструктор и шахтёрский комплекс.",
      requires: [], cost: { ironIngot: 10, copperIngot: 5, concrete: 5 }, crystals: 2,
      unlocks: {
        machines: ["miner", "smelter", "constructor"],
        resources: [],
        recipes: ["ironPlate", "ironRod", "screw", "wire", "cable", "copperSheet"]
      }
    },
    {
      id: "t1_pickaxe", tier: 1, icon: "⛏️", title: "Кирка++",
      description: "Утяжелённая кирка с усиленным наконечником. Каждый удар по жиле даёт вдвое больше руды.",
      requires: ["t1_metal"], cost: { ironIngot: 10, ironRod: 5 }, crystals: 1,
      effect: { clickMult: 2 },
      unlocks: { machines: [], resources: [], recipes: [] }
    },

    /* ── Уровень 2 ─────────────────────────────────────── */
    {
      id: "t2_steel", tier: 2, icon: "🏭", title: "Стальной передел",
      description: "Литейный цех сплавляет железо с углём. Балки, трубы и бетонированные конструкции открывают тяжёлое машиностроение.",
      requires: ["t1_metal"], cost: { ironPlate: 15, ironRod: 10, concrete: 10 }, crystals: 1,
      unlocks: {
        machines: ["foundry"], resources: [],
        recipes: ["steelIngot", "steelBeam", "steelPipe", "encasedIndustrialBeam"]
      }
    },
    {
      id: "t2_assembly", tier: 2, icon: "⚙️", title: "Сборочный цех",
      description: "Сборщик соединяет пластины, стержни и винты в готовые узлы. Начинается настоящая автоматизация.",
      requires: ["t1_metal"], cost: { ironPlate: 20, screw: 40, cable: 10 }, crystals: 1,
      unlocks: {
        machines: ["assembler"], resources: [],
        recipes: ["reinforcedIronPlate", "rotor", "modularFrame", "smartPlating"]
      }
    },
    {
      id: "t2_prospecting", tier: 2, icon: "🗺️", title: "Геологоразведка",
      description: "Карты жил и новые буровые насадки повышают добычу всех шахт и скважин на 25%.",
      requires: ["t1_pickaxe"], cost: { ironPlate: 10, concrete: 15 }, crystals: 1,
      effect: { extractMult: 1.25 },
      unlocks: { machines: [], resources: [], recipes: [] }
    },

    /* ── Уровень 3 ─────────────────────────────────────── */
    {
      id: "t3_oil", tier: 3, icon: "🛢️", title: "Нефтяная жила",
      description: "Нефтяная вышка и нефтепереработчик дают пластик, резину и топливо. Побочные фракции тоже пойдут в дело.",
      requires: ["t2_steel", "t2_assembly"], cost: { steelPipe: 10, concrete: 30, modularFrame: 2 }, crystals: 2,
      unlocks: {
        machines: ["refinery", "oilExtractor"], resources: [],
        recipes: ["extractOil", "plastic", "rubber", "fuel", "residualFuel", "petroleumCoke", "residualPlastic", "residualRubber"]
      }
    },
    {
      id: "t3_motors", tier: 3, icon: "🔧", title: "Двигатели",
      description: "Статоры, роторы и моторы превращают завод в механизм. Автоматизированная проводка и универсальные рамы идут на экспорт.",
      requires: ["t2_assembly", "t2_steel"], cost: { reinforcedIronPlate: 5, rotor: 5, cable: 20 }, crystals: 1,
      unlocks: {
        machines: [], resources: [],
        recipes: ["stator", "motor", "automatedWiring", "versatileFramework"]
      }
    },
    {
      id: "t3_water", tier: 3, icon: "💧", title: "Водоснабжение",
      description: "Водозабор качает воду без затрат сырья. Без неё не запустить нефтехимию, охлаждение и мокрые рецепты.",
      requires: ["t2_steel"], cost: { ironPlate: 20, copperSheet: 10, concrete: 20 }, crystals: 1,
      unlocks: {
        machines: ["waterExtractor"], resources: [],
        recipes: ["pumpWater"]
      }
    },
    {
      id: "t3_electronics", tier: 3, icon: "🖥️", title: "Печатные платы",
      description: "Медные листы и пластик складываются в первую электронику. Платы станут нервной системой завода.",
      requires: ["t3_oil", "t3_motors"], cost: { plastic: 20, copperSheet: 10, cable: 15 }, crystals: 1,
      unlocks: {
        machines: [], resources: [],
        recipes: ["circuitBoard"]
      }
    },

    /* ── Уровень 4 ─────────────────────────────────────── */
    {
      id: "t4_manufacturing", tier: 4, icon: "🧰", title: "Продвинутое производство",
      description: "Производитель собирает тяжёлые рамы, компьютеры и модульные двигатели. Появляются сложные многоступенчатые цепочки.",
      requires: ["t2_steel", "t3_motors", "t3_electronics"], cost: { modularFrame: 5, motor: 2, steelBeam: 20 }, crystals: 2,
      unlocks: {
        machines: ["manufacturer"], resources: [],
        recipes: ["heavyModularFrame", "computer", "modularEngine"]
      }
    },
    {
      id: "t4_caterium", tier: 4, icon: "🟡", title: "Катерий",
      description: "Редкий проводящий металл. Быстрая проволока, ограничители ИИ и высокоскоростные коннекторы резко ускоряют электронику.",
      requires: ["t3_electronics"], cost: { motor: 2, circuitBoard: 5, concrete: 30 }, crystals: 2,
      unlocks: {
        machines: [], resources: ["cateriumOre"],
        recipes: ["mineCateriumOre", "cateriumIngot", "quickwire", "aiLimiter", "highSpeedConnector"]
      }
    },
    {
      id: "t4_packaging", tier: 4, icon: "📦", title: "Тара и упаковка",
      description: "Упаковщик разливает жидкости в баллоны и резервуары. Позволяет хранить и перевозить нефтепродукты.",
      requires: ["t3_oil"], cost: { plastic: 20, steelPipe: 10, cable: 20 }, crystals: 1,
      unlocks: {
        machines: ["packager"], resources: [],
        recipes: ["emptyCanister", "emptyFluidTank", "packageFuel", "unpackageFuel", "packageHeavyOilResidue", "unpackageHeavyOilResidue"]
      }
    },
    {
      id: "t4_quartz", tier: 4, icon: "💎", title: "Кварцевое стекло",
      description: "Кварцевые жилы дают кристаллы и кремнезём. Без них не собрать осцилляторы, радиаторы и оптику.",
      requires: ["t3_motors"], cost: { steelBeam: 15, concrete: 30, cable: 20 }, crystals: 1,
      unlocks: {
        machines: [], resources: ["rawQuartz"],
        recipes: ["mineQuartz", "quartzCrystal", "silica"]
      }
    },
    {
      id: "t4_alt1", tier: 4, icon: "🧪", title: "Альтернативные рецепты I",
      description: "Лаборатория перебирает схемы переработки. Открывается большая группа ранних альтернативных рецептов — дешевле или быстрее обычных.",
      requires: ["t3_electronics", "t3_oil", "t3_water", "t4_caterium", "t4_quartz"],
      cost: { circuitBoard: 10, plastic: 40, rubber: 20 }, crystals: 2,
      unlocks: { machines: [], resources: [], recipes: ALT1.slice() }
    },

    /* ── Уровень 5 ─────────────────────────────────────── */
    {
      id: "t5_aluminum", tier: 5, icon: "🩶", title: "Алюминиевый контур",
      description: "Смеситель запускает цепочку глинозёма и алюминия. Лёгкие корпуса и листы нужны батареям и орбитальной технике.",
      requires: ["t4_manufacturing", "t3_electronics"], cost: { modularFrame: 5, motor: 4, plastic: 30 }, crystals: 2,
      unlocks: {
        machines: ["blender"], resources: ["bauxite"],
        recipes: ["mineBauxite", "aluminaSolution", "unpackageAluminaSolution", "packageAluminaSolution", "aluminumScrap", "aluminumIngot", "aluminumCasing", "alcladAluminumSheet"]
      }
    },
    {
      id: "t5_chemistry", tier: 5, icon: "⚗️", title: "Кислоты и батареи",
      description: "Сера превращается в серную кислоту. Начинаются аккумуляторы, турботопливо и агрессивная химия.",
      requires: ["t5_aluminum", "t4_packaging"], cost: { plastic: 30, rubber: 20, steelPipe: 20 }, crystals: 2,
      unlocks: {
        machines: [], resources: ["sulfur"],
        recipes: ["mineSulfur", "sulfuricAcid", "unpackageSulfuricAcid", "packageSulfuricAcid", "alternateCompactedCoal", "turbofuel", "battery"]
      }
    },
    {
      id: "t5_electronics", tier: 5, icon: "📡", title: "Электроника",
      description: "Кварцевые осцилляторы, суперкомпьютеры и радиоблоки. Завод начинает думать и управлять собой.",
      requires: ["t4_caterium", "t4_quartz", "t5_aluminum", "t4_manufacturing"],
      cost: { circuitBoard: 10, computer: 3, plastic: 40 }, crystals: 2,
      effect: { prodMult: 1.1 },
      unlocks: {
        machines: [], resources: [],
        recipes: ["crystalOscillator", "supercomputer", "radioControlUnit", "electromagneticControlRod", "heatSink"]
      }
    },
    {
      id: "t5_alt2", tier: 5, icon: "🧬", title: "Альтернативные рецепты II",
      description: "Новая партия экспериментальных схем: алюминий, кислоты, кварц, двигатели и упаковка.",
      requires: ["t5_aluminum", "t5_chemistry"], cost: { aluminumCasing: 20, circuitBoard: 15, computer: 3 }, crystals: 2,
      unlocks: { machines: [], resources: [], recipes: ALT2.slice() }
    },

    /* ── Уровень 6 ─────────────────────────────────────── */
    {
      id: "t6_uranium", tier: 6, icon: "☢️", title: "Урановый цикл",
      description: "Урановая руда, капсулированные ячейки и реактор. Сжигание стержней даёт отходы для плутониевой ветки.",
      requires: ["t5_chemistry", "t4_manufacturing"], cost: { computer: 5, heavyModularFrame: 2, concrete: 100 }, crystals: 2,
      unlocks: {
        machines: ["reactor"], resources: ["uranium"],
        recipes: ["mineUranium", "encasedUraniumCell", "uraniumFuelRod", "burnUraniumFuelRod", "nonFissileUranium"]
      }
    },
    {
      id: "t6_nitrogen", tier: 6, icon: "💨", title: "Азотная химия",
      description: "Азотная скважина и азотная кислота. Открываются охлаждающие системы и сплавленные модульные рамы.",
      requires: ["t5_aluminum", "t5_chemistry"], cost: { computer: 5, steelPipe: 30, aluminumCasing: 20 }, crystals: 2,
      unlocks: {
        machines: ["nitrogenWell"], resources: [],
        recipes: ["extractNitrogen", "nitricAcid", "unpackageNitricAcid", "packageNitricAcid", "packagedNitrogenGas", "coolingSystem", "fusedModularFrame"]
      }
    },
    {
      id: "t6_energy", tier: 6, icon: "⚡", title: "Энергетические осколки",
      description: "Энергослизни можно собирать вручную. Осколки нужны для ионизированного топлива и матриц инопланетной энергии.",
      requires: ["t5_chemistry", "t4_caterium"], cost: { battery: 10, computer: 5, cable: 50 }, crystals: 2,
      unlocks: {
        machines: [], resources: ["bluePowerSlug", "yellowPowerSlug", "purplePowerSlug"],
        recipes: ["powerShard1", "powerShard2", "powerShard5"]
      }
    },

    /* ── Уровень 7 ─────────────────────────────────────── */
    {
      id: "t7_particle", tier: 7, icon: "⚛️", title: "Ускоритель частиц",
      description: "Ускоритель создаёт алмазы, кристаллы времени, ядерную пасту и плутониевые таблетки. Начинается эра экзотики.",
      requires: ["t6_uranium", "t6_nitrogen", "t5_electronics"], cost: { supercomputer: 5, heavyModularFrame: 5, coolingSystem: 5 }, crystals: 3,
      unlocks: {
        machines: ["particleAccelerator"], resources: [],
        recipes: ["diamonds", "timeCrystal", "copperPowder", "plutoniumPellet", "encasedPlutoniumCell", "plutoniumFuelRod", "burnPlutoniumFuelRod", "nuclearPasta"]
      }
    },
    {
      id: "t7_turbines", tier: 7, icon: "🌀", title: "Турбомашины",
      description: "Турбомоторы, кубы давления и ракеты с тепловой тягой. Продукция для орбитальной программы.",
      requires: ["t5_electronics", "t6_nitrogen"], cost: { motor: 10, computer: 10, aluminumCasing: 50 }, crystals: 3,
      effect: { prodMult: 1.15 },
      unlocks: {
        machines: [], resources: [],
        recipes: ["turboMotor", "pressureConversionCube", "thermalPropulsionRocket", "magneticFieldGenerator"]
      }
    },
    {
      id: "t7_rocketFuel", tier: 7, icon: "🚀", title: "Ракетное топливо",
      description: "Турботопливо и азотная кислота дают ракетное топливо. Ионизация осколком поднимает энергоотдачу ещё выше.",
      requires: ["t6_nitrogen", "t6_energy"], cost: { fuel: 100, compactedCoal: 50, computer: 5 }, crystals: 2,
      unlocks: {
        machines: [], resources: [],
        recipes: ["rocketFuel", "ionizedFuel", "packageRocketFuel", "unpackageRocketFuel"]
      }
    },
    {
      id: "t7_sam", tier: 7, icon: "🟣", title: "Технологии СИМ",
      description: "Странная материя реагирует на металлы. Реанимированный СИМ и флуктуаторы открывают дверь к фиксонию.",
      requires: ["t5_electronics", "t6_energy"], cost: { computer: 10, highSpeedConnector: 5, plastic: 50 }, crystals: 2,
      unlocks: {
        machines: [], resources: ["samOre"],
        recipes: ["mineSam", "reanimatedSam", "samFluctuator"]
      }
    },

    /* ── Уровень 8 ─────────────────────────────────────── */
    {
      id: "t8_darkMatter", tier: 8, icon: "🌌", title: "Тёмная материя",
      description: "Квантовый кодировщик собирает кристаллы тёмной материи, осцилляторы суперпозиции и ячейки сингулярности.",
      requires: ["t7_particle", "t7_sam", "t5_electronics"], cost: { supercomputer: 10, coolingSystem: 10, battery: 20 }, crystals: 3,
      effect: { prodMult: 1.16 },
      unlocks: {
        machines: ["quantumEncoder"], resources: [],
        recipes: ["excitedPhotonicMatter", "darkMatterResidue", "darkMatterCrystal", "superpositionOscillator", "singularityCell", "alienPowerMatrix"]
      }
    },
    {
      id: "t8_ficsonium", tier: 8, icon: "🔮", title: "Фиксоний",
      description: "Конвертер перестраивает атомы. Фиксит, тригоны и фиксоний — последний материал, который признаёт местная физика.",
      requires: ["t8_darkMatter", "t7_particle"], cost: { supercomputer: 5, samFluctuator: 10, crystalOscillator: 5 }, crystals: 3,
      unlocks: {
        machines: ["converter"], resources: [],
        recipes: ["ficsiteIngotIron", "ficsiteIngotAluminum", "ficsiteIngotCaterium", "ficsiteTrigon", "ficsonium", "ficsoniumFuelRod"]
      }
    },
    {
      id: "t8_alt3", tier: 8, icon: "🧿", title: "Альтернативные рецепты III",
      description: "Последний блок экспериментальных схем: плутоний, турбомашины, фиксоний и тёмная материя.",
      requires: ["t8_darkMatter"], cost: { computer: 50, supercomputer: 5, circuitBoard: 50 }, crystals: 3,
      unlocks: { machines: [], resources: [], recipes: ALT3.slice() }
    },

    /* ── Уровень 9 ─────────────────────────────────────── */
    {
      id: "t9_singularity", tier: 9, icon: "🌠", title: "Сингулярность",
      description: "Баллистический варп-двигатель, адаптивные блоки и система управления сборкой. Завод выходит на орбиту.",
      requires: ["t8_ficsonium", "t8_darkMatter", "t7_turbines"], cost: { supercomputer: 20, turboMotor: 10, fusedModularFrame: 10 }, crystals: 5,
      effect: { prodMult: 1.5 },
      unlocks: {
        machines: [], resources: [],
        recipes: ["adaptiveControlUnit", "assemblyDirectorSystem", "ballisticWarpDrive"]
      }
    },
    {
      id: "t9_transcendence", tier: 9, icon: "♾️", title: "Квантовый предел",
      description: "Биохимический скульптор и протокол удвоения. Производство ускоряется вдвое, ручная добыча — тоже.",
      requires: ["t9_singularity"], cost: { singularityCell: 10, superpositionOscillator: 5, alienPowerMatrix: 5 }, crystals: 8,
      effect: { prodMult: 2, clickMult: 2 },
      unlocks: {
        machines: [], resources: [],
        recipes: ["biochemicalSculptor"]
      }
    },
    {
      id: "t9_rocket", tier: 9, icon: "🚀", title: "Строительство ракеты",
      description: "Финальный орбитальный проект. Соберите топливо, двигатели, варп-привод, сингулярности и матрицы в одну ракету. Это уже не технология, а путевка с планеты.",
      requires: ["t9_singularity", "t9_transcendence", "t7_rocketFuel"],
      cost: {
        rocketFuel: 3000,
        thermalPropulsionRocket: 100,
        turboMotor: 100,
        fusedModularFrame: 200,
        pressureConversionCube: 50,
        adaptiveControlUnit: 50,
        assemblyDirectorSystem: 20,
        ballisticWarpDrive: 10,
        singularityCell: 100,
        alienPowerMatrix: 25,
        superpositionOscillator: 50,
        ficsoniumFuelRod: 20,
        nuclearPasta: 100
      },
      crystals: 100,
      effect: { prodMult: 2, clickMult: 2 },
      victory: true,
      unlocks: { machines: [], resources: [], recipes: [] }
    }
  ];

  /* Технологии подорожали в 10 раз. Ракета — исключение: её цена задана
     сразу в финальных количествах и не масштабируется повторно. */
  for (const t of D.TECH) {
    if (t.id === "t9_rocket") continue;
    for (const key of Object.keys(t.cost || {})) t.cost[key] *= 10;
  }

  D.TECH_BY_ID = {};
  D.TECH.forEach(t => { D.TECH_BY_ID[t.id] = t; });
})();
