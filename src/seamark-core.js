/**
 * Навигационные знаки на карте экрана 15: буи, знаки (beacon), огни — из OpenStreetMap (теги seamark:*).
 * Раньше их давал растр OpenSeaMap, но он рисует и схемы разделения движения, причём свои, не те, что
 * в наших данных TSS; по слоям растр не режется. Теперь на карте один источник TSS (src/data/tss.js),
 * а знаки рисуем сами.
 *
 * seamarkCore() самодостаточна, как chartStyle(): страница получает текст функции и рисует значки на canvas (draw).
 * Знаки мира выгружены из Overpass заранее (scripts/fetch-seamarks.mjs, разбор — parse) и лежат тайлами в D1:
 * Overpass не отвечает дата-центрам Cloudflare (521/504), а с телефонов — через раз (429/502, таймауты).
 * Данные © участники OpenStreetMap, ODbL.
 */
export function seamarkCore() {
  const Z = 10; // знаки приходят тайлами этого масштаба (~20 миль у экватора)

  // Буи и знаки: тип seamark → [вид, форма по умолчанию]
  const KIND = {
    buoy_lateral: "b", buoy_cardinal: "b", buoy_isolated_danger: "b", buoy_safe_water: "b", buoy_special_purpose: "b",
    buoy_installation: "b", buoy_emergency_wreck_marking: "b",
    beacon_lateral: "k", beacon_cardinal: "k", beacon_isolated_danger: "k", beacon_safe_water: "k", beacon_special_purpose: "k",
    light_major: "l", light_minor: "l", light: "l", light_vessel: "v", light_float: "v", landmark: "m",
  };
  const COL = { white: "W", red: "R", green: "G", yellow: "Y", black: "B", blue: "Bu", orange: "Or", violet: "Vi", amber: "Am", grey: "Gy", brown: "Br", magenta: "Mg", pink: "Pk" };

  function split(v) { return String(v || "").split(";").map(function (s) { return s.trim(); }).filter(Boolean); }

  // Огонь: все секторы (seamark:light:N:*) и одиночный (seamark:light:*) → [{ch, gr, col[], per, rng}]
  function lights(t) {
    const out = [];
    const one = function (p) {
      const ch = t[p + "character"], col = split(t[p + "colour"]);
      if (!ch && !col.length) return;
      out.push({ ch: ch || "", gr: t[p + "group"] || "", col: col, per: t[p + "period"] || "", rng: t[p + "range"] || "" });
    };
    one("seamark:light:");
    for (let i = 1; i <= 30; i++) if (t["seamark:light:" + i + ":colour"] || t["seamark:light:" + i + ":character"]) one("seamark:light:" + i + ":");
    return out;
  }

  // Подпись огня как на бумажной карте (INT 1, P): «Fl(2)WRG.10s12M»; белый одиночный — без буквы
  function lightLabel(ls) {
    if (!ls.length) return "";
    const L = ls[0];
    const cols = [];
    ls.forEach(function (l) { l.col.forEach(function (c) { const a = COL[c] || ""; if (a && cols.indexOf(a) < 0) cols.push(a); }); });
    const ch = (L.ch || "").replace(/\s+/g, "");
    let s = ch + (L.gr ? "(" + L.gr + ")" : "");
    const c = cols.length === 1 && cols[0] === "W" ? "" : cols.join("");
    if (c) s += (s ? "." : "") + c;
    if (L.per) s += (s ? "." : "") + String(L.per).replace(/\.0+$/, "") + "s";
    let rng = 0;
    ls.forEach(function (l) { const r = parseFloat(l.rng); if (r > rng) rng = r; });
    if (rng) s += Math.round(rng) + "M";
    return s;
  }

  // Цвет проблеска: один цвет огня — его, иначе (секторы, белый) — пурпурный, как в S-52
  function flareColour(ls) {
    const set = {};
    ls.forEach(function (l) { l.col.forEach(function (c) { set[c] = true; }); });
    const k = Object.keys(set);
    return k.length === 1 && (k[0] === "red" || k[0] === "green") ? k[0] : k.length === 1 && k[0] === "yellow" ? "yellow" : "white";
  }

  /**
   * Ответ Overpass → компактные знаки [lon, lat, ключ значка, подпись огня, цвет проблеска, название].
   * Ключ значка: «вид|форма|цвета|узор|топовая фигура|её цвета». Пустой ключ — знака нет, только огонь.
   */
  function parse(elements) {
    const out = [];
    (elements || []).forEach(function (e) {
      if (e.type !== "node" || !e.tags) return;
      const t = e.tags, type = t["seamark:type"] || "";
      const kind = KIND[type] || (/^buoy_/.test(type) ? "b" : /^beacon_/.test(type) ? "k" : "");
      const ls = lights(t);
      if (!kind && !ls.length) return;
      let key = "";
      if (kind === "b" || kind === "k" || kind === "v") {
        const p = "seamark:" + type + ":";
        const shape = t[p + "shape"] || (kind === "v" ? "vessel" : kind === "k" ? "stake" : "pillar");
        const cols = split(t[p + "colour"]).map(function (c) { return COL[c] || ""; }).filter(Boolean);
        const pat = (t[p + "colour_pattern"] || "").slice(0, 1); // h(orizontal) / v(ertical) / ""
        const tm = t["seamark:topmark:shape"] || "";
        const tc = split(t["seamark:topmark:colour"]).map(function (c) { return COL[c] || ""; }).filter(Boolean);
        key = [kind, shape, cols.join(","), pat, tm, tc.join(",")].join("|");
      }
      const name = t["seamark:name"] || t.name || "";
      out.push([Math.round(e.lon * 1e5) / 1e5, Math.round(e.lat * 1e5) / 1e5, key, lightLabel(ls), ls.length ? flareColour(ls) : "", name]);
    });
    return out;
  }

  // ---------------------------------------------------------------
  // США: USCG Light List через NOAA MarineCadastre (общественное достояние) — в OSM американские знаки дырявые.
  // Запись: aidname «… Lighted Bell Buoy 2», structure «Red nun» / «TR on pile», characteristics «Fl (2+1)G 6s».
  // ---------------------------------------------------------------
  // Районы, где есть данные USCG: [запад, юг, восток, север]
  const US_BOXES = [[-125.5, 24, -66, 49.5], [-180, 51, -129, 72], [172, 51, 180, 54], [-161, 18.5, -154, 22.5], [-68, 17.5, -64.3, 18.8], [144.5, 13.2, 145.9, 15.3]];
  function inUS(w, s, e, n) { return US_BOXES.some(function (b) { return w < b[2] && e > b[0] && s < b[3] && n > b[1]; }); }
  const USCOL = { red: "R", green: "G", yellow: "Y", black: "B", white: "W", orange: "Or" };
  function uscgLight(ch) {
    // «Fl (2+1)G 6s», «Q R», «Mo (A) W», «Al RW 8s», «F W R G» → { label: «Fl(2+1).G.6s», cols: ["G"] }
    const m = /^(Al\s*)?(LFl|Fl|F|VQ|IQ|Q|Iso|Oc|Mo)?\s*(\([^)]*\))?\s*([WRGY](?:\s*[WRGY])*)?\s*([\d.]+)?\s*s?\b/.exec(String(ch || "").trim());
    if (!m || (!m[1] && !m[2])) return null; // «Al RW 8s» — переменный огонь без проблесков тоже огонь
    const cols = (m[4] || "W").replace(/\s+/g, "").split("");
    const uniq = cols.filter(function (c, i) { return cols.indexOf(c) === i; });
    let label = (m[1] ? "Al" + (m[2] ? "." : "") : "") + (m[2] || "") + (m[3] ? m[3].replace(/\s+/g, "") : "");
    if (!(uniq.length === 1 && uniq[0] === "W")) label += "." + uniq.join("");
    if (m[5]) label += "." + m[5] + "s";
    return { label: label, cols: uniq };
  }
  function parseUscg(features) {
    const out = [];
    (features || []).forEach(function (f) {
      const a = f.attributes || {}, g = f.geometry || {};
      if (typeof g.x !== "number" || typeof g.y !== "number") return;
      const name = String(a.aidname || ""), st = String(a.structure || "").toLowerCase(), lt = uscgLight(a.characteristics);
      const isBuoy = /\bbuoy\b/i.test(name), isBeacon = /daybeacon/i.test(name);
      let key = "";
      if (isBuoy || isBeacon) {
        const cols = [];
        st.replace(/\b(red|green|yellow|black|white|orange)\b/g, function (w) { const c = USCOL[w]; if (cols[cols.length - 1] !== c) cols.push(c); return w; });
        // «… with green bands» — полоса посередине: красный-зелёный-красный
        if (/with \w+ bands/.test(st) && cols.length === 2) cols.push(cols[0]);
        const pat = /stripes/.test(st) ? "v" : cols.length > 1 ? "h" : "";
        let shape = /\bnun\b/.test(st) ? "conical" : /\bcan\b/.test(st) ? "can" : /\bspar\b/.test(st) ? "spar" : /spherical/.test(st) ? "spherical" : "pillar";
        let tm = "", tc = "";
        if (isBeacon) {
          // щит знака: TR — красный треугольник, SG — зелёный квадрат, NR/NG/NB — квадрат без бокового значения
          shape = /tower/.test(st) ? "tower" : "stake";
          const d = /\b(t|s|n|k)([rgbwy]+)\b/.exec(st);
          if (d) { tm = d[1] === "t" ? "cone, point up" : "cube"; tc = { r: "R", g: "G", b: "B", w: "W", y: "Y" }[d[2][0]] || ""; }
        } else if (/spherical/.test(st) && /stripes/.test(st)) { tm = "sphere"; tc = "R"; }
        key = [isBuoy ? "b" : "k", shape, (isBeacon ? [] : cols).join(","), isBeacon ? "" : pat, tm, tc].join("|");
      } else if (!lt) return; // не знак и без огня
      const fl = lt ? (lt.cols.length === 1 && lt.cols[0] === "R" ? "red" : lt.cols.length === 1 && lt.cols[0] === "G" ? "green" : lt.cols.length === 1 && lt.cols[0] === "Y" ? "yellow" : "white") : "";
      out.push([Math.round(g.x * 1e5) / 1e5, Math.round(g.y * 1e5) / 1e5, key, lt ? lt.label : "", fl, name]);
    });
    return out;
  }
  // Склейка: знак OSM ближе ~30 м к знаку USCG — тот же самый, остаётся официальный
  function mergeUS(osm, us) {
    if (!us.length) return osm;
    return us.concat(osm.filter(function (f) { return !us.some(function (u) { return Math.abs(u[0] - f[0]) < 0.0004 && Math.abs(u[1] - f[1]) < 0.0003; }); }));
  }

  // Тайл z/x/y → рамка [юг, запад, север, восток]
  function tileBox(x, y, z) {
    const n = 2 ** z;
    const lat = function (yy) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI; };
    return [lat(y + 1), x / n * 360 - 180, lat(y), (x + 1) / n * 360 - 180];
  }
  function overpassQuery(x, y) {
    const b = tileBox(x, y, Z).map(function (v) { return v.toFixed(5); }).join(",");
    return "[out:json][timeout:25];(node[\"seamark:type\"~\"^(buoy_|beacon_|light|landmark)\"](" + b + ");" +
      "node[\"seamark:light:character\"](" + b + ");node[\"seamark:light:1:colour\"](" + b + "););out;";
  }
  // Тайлы масштаба Z, покрывающие рамку карты (долготы могут выходить за ±180)
  function tilesFor(west, south, east, north) {
    const n = 2 ** Z, out = [];
    const tx = function (lon) { return Math.floor((lon + 180) / 360 * n); };
    const ty = function (lat) { const r = Math.max(-85, Math.min(85, lat)) * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
    for (let y = ty(north); y <= ty(south); y++)
      for (let x = tx(west); x <= tx(east); x++) out.push(Z + "/" + (((x % n) + n) % n) + "/" + y);
    return out;
  }

  // ---------------------------------------------------------------
  // Рисование значков (в браузере, на canvas): упрощённые символы INT 1 / S-52, вертикально.
  // ---------------------------------------------------------------
  const PAINT = {
    day: { R: "#e0242e", G: "#1e9a3c", Y: "#f2c214", B: "#1e2427", W: "#ffffff", Bu: "#2b62c9", Or: "#f08a1c", Vi: "#8a3ab9", Am: "#f0a01c", Gy: "#8a9399", Br: "#7a4a24", Mg: "#c045d1", Pk: "#f08ab4", line: "#1e2427", none: "#9aa5aa" },
    night: { R: "#a8202a", G: "#1c7232", Y: "#a88a14", B: "#0b1012", W: "#9aa4a2", Bu: "#244e96", Or: "#a8641c", Vi: "#64307e", Am: "#a8761c", Gy: "#5a6266", Br: "#55361c", Mg: "#9a4aa6", Pk: "#a86484", line: "#a9b4b2", none: "#5a6266" },
  };
  const FLARE = { day: { red: "#e0242e", green: "#1e9a3c", yellow: "#f2c214", white: "#c045d1" }, night: { red: "#a8202a", green: "#1c7232", yellow: "#a88a14", white: "#9a4aa6" } };

  // Контур тела знака в координатах значка 24×32 (основание в (12, 30))
  function bodyPath(ctx, kind, shape) {
    ctx.beginPath();
    if (kind === "k") {
      if (/tower|cairn|lattice/.test(shape)) { ctx.moveTo(8, 30); ctx.lineTo(10, 12); ctx.lineTo(14, 12); ctx.lineTo(16, 30); ctx.closePath(); }
      else { ctx.moveTo(10.5, 30); ctx.lineTo(10.5, 12); ctx.lineTo(13.5, 12); ctx.lineTo(13.5, 30); ctx.closePath(); }
      return;
    }
    if (kind === "v") { ctx.moveTo(3, 24); ctx.lineTo(21, 24); ctx.lineTo(18, 30); ctx.lineTo(6, 30); ctx.closePath(); return; }
    switch (shape) {
      case "conical": ctx.moveTo(6, 30); ctx.lineTo(12, 16); ctx.lineTo(18, 30); ctx.closePath(); break;
      case "can": ctx.rect(6.5, 19, 11, 11); break;
      case "spherical": ctx.arc(12, 24, 6, 0, 2 * Math.PI); break;
      case "spar": ctx.rect(10.5, 13, 3, 17); break;
      case "barrel": ctx.ellipse(12, 25, 7, 5, 0, 0, 2 * Math.PI); break;
      case "super-buoy": ctx.moveTo(3, 30); ctx.lineTo(6, 20); ctx.lineTo(18, 20); ctx.lineTo(21, 30); ctx.closePath(); break;
      default: ctx.moveTo(7, 30); ctx.lineTo(10, 13); ctx.lineTo(14, 13); ctx.lineTo(17, 30); ctx.closePath(); // pillar
    }
  }
  // Топовая фигура над телом (верх тела около y = 13)
  function topmark(ctx, shape, fill, line) {
    if (!shape) return false;
    const cone = function (yb, up) { ctx.beginPath(); if (up) { ctx.moveTo(8, yb); ctx.lineTo(12, yb - 5); ctx.lineTo(16, yb); } else { ctx.moveTo(8, yb - 5); ctx.lineTo(12, yb); ctx.lineTo(16, yb - 5); } ctx.closePath(); ctx.fill(); ctx.stroke(); };
    const ball = function (cy) { ctx.beginPath(); ctx.arc(12, cy, 2.6, 0, 2 * Math.PI); ctx.fill(); ctx.stroke(); };
    ctx.fillStyle = fill; ctx.strokeStyle = line; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(12, 13); ctx.lineTo(12, 10); ctx.stroke();
    if (shape === "2 cones up") { cone(10, true); cone(5, true); }
    else if (shape === "2 cones down") { cone(10, false); cone(5, false); }
    else if (shape === "2 cones base together") { cone(5, true); cone(10, false); } // E: основаниями друг к другу — ромб
    else if (shape === "2 cones point together") { cone(5, false); cone(10, true); } // W: остриями друг к другу — «песочные часы»
    else if (/^cone, point up/.test(shape)) cone(10, true);
    else if (/^cone, point down/.test(shape)) cone(10, false);
    else if (shape === "2 spheres") { ball(7.4); ball(2.6); }
    else if (shape === "sphere") ball(7.4);
    else if (/cylinder|can/.test(shape)) { ctx.beginPath(); ctx.rect(9, 4, 6, 6); ctx.fill(); ctx.stroke(); }
    else if (/x-shape|cross/.test(shape)) { ctx.lineWidth = 2; ctx.strokeStyle = fill; ctx.beginPath(); ctx.moveTo(9, 4); ctx.lineTo(15, 10); ctx.moveTo(15, 4); ctx.lineTo(9, 10); ctx.stroke(); }
    else if (/cube|square|board/.test(shape)) { ctx.beginPath(); ctx.rect(9, 4.5, 6, 5.5); ctx.fill(); ctx.stroke(); }
    else return false;
    return true;
  }

  /**
   * Нарисовать значок по ключу. ctx — 2D-контекст холста 24×32 · ratio. Тема — "day" | "night".
   * Ключ «flare|цвет» — проблеск огня: капля от точки (0, 0) на юго-восток, как на бумажной карте.
   */
  function draw(ctx, key, theme, ratio) {
    const P = PAINT[theme] || PAINT.day;
    ctx.save();
    ctx.scale(ratio, ratio);
    const f = key.split("|");
    if (f[0] === "flare") {
      ctx.translate(2, 2); ctx.rotate(-Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(4, 6, 4, 16, 0, 20); ctx.bezierCurveTo(-4, 16, -4, 6, 0, 0);
      ctx.fillStyle = (FLARE[theme] || FLARE.day)[f[1]] || P.Mg; ctx.globalAlpha = 0.9; ctx.fill();
      ctx.restore();
      return;
    }
    const kind = f[0], shape = f[1], cols = f[2] ? f[2].split(",") : [], pat = f[3], tm = f[4], tc = f[5] ? f[5].split(",") : [];
    const lw = 1;
    // тело: полосы цветов, обрезанные по контуру
    bodyPath(ctx, kind, shape);
    ctx.save(); ctx.clip();
    const fills = cols.length ? cols : ["none"];
    const n = fills.length;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = P[fills[i]] || P.none;
      if (pat === "v") ctx.fillRect(3 + 18 * i / n, 0, 18 / n + 0.5, 32);
      else ctx.fillRect(0, 12 + 18 * i / n, 24, 18 / n + 0.5); // по умолчанию — горизонтальные полосы сверху вниз
    }
    ctx.restore();
    bodyPath(ctx, kind, shape);
    ctx.strokeStyle = P.line; ctx.lineWidth = lw; ctx.stroke();
    // основание: черта по воде и точка места
    ctx.beginPath(); ctx.moveTo(3, 30.5); ctx.lineTo(21, 30.5); ctx.stroke();
    if (tm && kind !== "v") topmark(ctx, tm, P[tc[0]] || P[cols[0]] || P.B, P.line);
    ctx.restore();
  }
  // Размер значка (в точках CSS) и точка привязки
  const SIZE = { w: 24, h: 32 };

  return { Z: Z, parse: parse, parseUscg: parseUscg, uscgLight: uscgLight, inUS: inUS, mergeUS: mergeUS, lightLabel: lightLabel, lights: lights, tileBox: tileBox, overpassQuery: overpassQuery, tilesFor: tilesFor, draw: draw, SIZE: SIZE };
}
