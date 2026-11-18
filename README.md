# seamarks-builder

Выгрузка навигационных знаков (буи, знаки, огни) из OpenStreetMap и нарезка в тайлы z8 для карты
Cadet Library. Запуск: Actions → **Build seamark tiles** → Run workflow. Результат — ветка `seamarks-data`.

- `scripts/geojsonseq-to-sm.mjs` — выгрузка osmium → формат элементов Overpass;
- `scripts/build-seamarks.mjs` — тайлы `<z>/<x>/<y>.json`, дубли по id отбрасываются;
- `src/seamark-core.js` — разбор тегов `seamark:*`.

Данные © участники OpenStreetMap, лицензия ODbL. Выгрузки континентов — Geofabrik.
