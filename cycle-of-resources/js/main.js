/* Цикл ресурсов — запуск игры и главный цикл. */
(function () {
  const COR = window.COR;
  const game = new COR.Game();
  const sound = new COR.Sound();

  const loaded = game.loadFromStorage();
  let offline = null;
  let isNew = false;
  let loadIssue = null;

  if (loaded.ok) {
    sound.enabled = !!game.settings.sound;
    if (loaded.elapsed > 1) offline = game.simulateOffline(loaded.elapsed);
  } else if (loaded.reason === "empty") {
    isNew = true;
    sound.enabled = !!game.settings.sound;
  } else {
    isNew = true;
    loadIssue = loaded.reason || "storage";
    sound.enabled = !!game.settings.sound;
  }

  const ambient = new COR.Ambient(document.getElementById("ambient"));
  if (ambient) ambient.setEnabled(!!game.settings.particles);

  const ui = new COR.UI(game, sound, ambient);
  window.COR.game = game;
  window.COR.ui = ui;
  ui.init();

  if (loadIssue) {
    ui.toast({
      icon: "⚠️",
      title: "Сохранение не загружено",
      text: loadIssue === "storage"
        ? "localStorage недоступен. Игра работает, но прогресс может не сохраниться."
        : "Файл сохранения повреждён. Начинаем новый цикл.",
      type: "error",
      duration: 7000
    });
  }

  if (offline && offline.seconds >= 60) {
    setTimeout(() => ui.showOffline(offline), 260);
  } else if (offline && offline.seconds > 1) {
    ui.toast({
      icon: "🌙",
      title: "Офлайн-прогресс",
      text: `Начислено за ${COR.util.formatDuration(offline.seconds)}.`,
      type: "info"
    });
  }

  if (isNew && !loadIssue) {
    setTimeout(() => {
      ui.toast({
        icon: "⛏️",
        title: "Смена открыта",
        text: "Добудьте железо и медь, сплавьте первые слитки вручную — затем исследуйте «Первый металл».",
        type: "info",
        duration: 7000
      });
    }, 700);
  }

  /* Автосохранение каждые 10 секунд. */
  setInterval(() => {
    if (!document.hidden) ui.save(true);
  }, 10000);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) game.save();
  });
  window.addEventListener("pagehide", () => game.save());
  window.addEventListener("beforeunload", () => game.save());

  let lastError = null;
  window.addEventListener("error", (e) => {
    const msg = e && e.message ? e.message : "Неизвестная ошибка";
    if (msg === lastError) return;
    lastError = msg;
    if (window.COR && window.COR.ui) {
      window.COR.ui.toast({ icon: "⚠️", title: "Сбой интерфейса", text: msg, type: "error", duration: 6000 });
    }
  });

  function frame(now) {
    game.tick(now);
    ui.frame(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
