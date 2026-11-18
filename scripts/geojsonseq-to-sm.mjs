// Переводит выгрузку osmium (export -f geojsonseq --add-unique-id=type_id) в формат Overpass JSON,
// который читает scripts/build-seamarks.mjs: { elements: [{ type: "node", id, lat, lon, tags }] }.
//   node scripts/geojsonseq-to-sm.mjs <файл.geojsonseq> <sm-raw/sq_имя.json>
// Знаки берутся из готовых выгрузок OpenStreetMap (Geofabrik), а не из Overpass: публичные серверы Overpass
// не вытягивают выгрузку мира. Данные © участники OpenStreetMap, ODbL.
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error("укажите файл geojsonseq и файл результата"); process.exit(1); }
const elements = [];
for await (const raw of createInterface({ input: createReadStream(src, "utf8"), crlfDelay: Infinity })) {
  const line = raw.replace(/^\x1e/, "").trim();
  if (!line) continue;
  const f = JSON.parse(line);
  if (!f.geometry || f.geometry.type !== "Point") continue;
  const id = Number(String(f.id || "").replace(/^n/, "")) || 0;
  elements.push({ type: "node", id, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], tags: f.properties || {} });
}
writeFileSync(dst, JSON.stringify({ elements }));
console.log(`${src}: ${elements.length} точек`);
