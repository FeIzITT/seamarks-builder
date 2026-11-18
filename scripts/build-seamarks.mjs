// Собирает тайлы навигационных знаков из выгрузки OSM (Overpass — scripts/fetch-seamarks.mjs, или Geofabrik — scripts/geojsonseq-to-sm.mjs).
//   node scripts/build-seamarks.mjs <sm-raw> <sm-tiles>   →   <sm-tiles>/Z/x/y.json и index.json
// Тот же разбор, что в Mini App (src/seamark-core.js): [lon, lat, ключ значка, подпись огня, цвет проблеска, название].
// Тайлы масштаба Z (8: ~1,4°) — Worker отдаёт их из R2 по /seamarks.json?t=8/x/y. © участники OpenStreetMap, ODbL.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { seamarkCore } from "../src/seamark-core.js";

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error("укажите папку выгрузки и папку тайлов"); process.exit(1); }
const Z = 8, N = 2 ** Z;
const S = seamarkCore();
const seen = new Set(), tiles = {};
let total = 0;
for (const f of readdirSync(src).filter((n) => /^sq_.*\.json$/.test(n)).sort()) {
  const els = (JSON.parse(readFileSync(join(src, f), "utf8")).elements || []).filter((e) => e.type === "node" && !seen.has(e.id) && seen.add(e.id));
  for (const m of S.parse(els)) {
    const x = Math.floor(((m[0] + 180) / 360) * N), r = (Math.max(-85, Math.min(85, m[1])) * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * N);
    (tiles[x + "/" + Math.min(N - 1, Math.max(0, y))] = tiles[x + "/" + Math.min(N - 1, Math.max(0, y))] || []).push(m);
    total++;
  }
}
let bytes = 0;
for (const [k, list] of Object.entries(tiles)) {
  const [x, y] = k.split("/");
  mkdirSync(join(out, String(Z), x), { recursive: true });
  const s = JSON.stringify(list);
  bytes += s.length;
  writeFileSync(join(out, String(Z), x, y + ".json"), s);
}
writeFileSync(join(out, "index.json"), JSON.stringify({ z: Z, tiles: Object.keys(tiles).length, marks: total, built: new Date().toISOString() }));
console.log(`знаков ${total}, тайлов ${Object.keys(tiles).length}, ${(bytes / 1048576).toFixed(1)} МБ`);
