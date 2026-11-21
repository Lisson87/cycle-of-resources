# Исходники «Цикла ресурсов»

Актуальное описание и ссылки — в [корневом README](../README.md).

Запуск без сборки: откройте `index.html` в браузере. Все скрипты подключены как обычные `<script>`, поэтому `file://` работает.

Проверки:

```powershell
node tools/validate.cjs
node tools/smoke.cjs
node tools/simulate.cjs
```

Сборка одного файла:

```powershell
multitool-node --skill websites site.cjs bundle index.html ../index.html
```

Сценарии браузерной проверки: `tools/actions.json` и `tools/actions-constructor.json`.
