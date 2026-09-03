// Refetch the full cinematheque schedule and rewrite CC_SCHEDULE in
// pages/cinematheque.html. Run:  node scripts/refetch-manila.js  (any cwd)
//   - Manila: from the public Ticket Tailor listing page
//     (tickettailor.com/events/fdcpexhibition). Each row carries its own
//     `link` to the Ticket Tailor event page ("View Details" target).
//   - Negros / Iloilo / Davao: from the schedule Google Sheet (CSV). The page
//     also re-fetches this sheet live on every visit (loadSheetRegions), so
//     the baked regional rows are just the instant-paint fallback.
// The live path for Manila is the Apps Script proxy (film-links-proxy.gs),
// which scrapes the same Ticket Tailor page server-side.
const fs = require("fs"), https = require("https"), path = require("path");
const CINEMATHEQUE = path.join(__dirname, "..", "pages", "cinematheque.html");

const TT_BASE = "https://www.tickettailor.com";
const TT_LIST = TT_BASE + "/events/fdcpexhibition";
const SHEET = "https://docs.google.com/spreadsheets/d/1Bu-vxwXmJpTGYH3OpE6Z83Fs7513uPeVZYB7_-fjBl8/gviz/tq?tqx=out:csv";
// Ticket Tailor 403s the default node UA; a browser-ish one is enough.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { "User-Agent": UA } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return get(r.headers.location).then(res, rej);
    let d = ""; r.on("data", c => d += c); r.on("end", () => res(d));
  }).on("error", rej));
}
const pad = n => String(n).length < 2 ? "0" + n : "" + n;

// The listing HTML entity-escapes attribute values (&#x2F; etc.) -- unescape
// the numeric + common named entities before matching hrefs.
function unescapeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

// One listing <li> per occurrence: the event__link anchor holds the detail
// URL (?date=YYYY-MM-DD) + full title; the meta chunk before
// event-meta__location holds the start time. Titles follow "Program: Film".
function parseTicketTailor(html) {
  const u = unescapeEntities(html);
  const re = /href="(\/events\/[a-z0-9_-]+\/\d+\?date=(\d{4})-(\d{2})-(\d{2}))" class="event__link">([^<]+)<\/a>([\s\S]*?)event-meta__location/g;
  const rows = []; let m;
  while ((m = re.exec(u)) !== null) {
    const y = +m[2], mo = +m[3] - 1, d = +m[4];
    const t = /(\d{1,2}:\d{2}\s*[AP]M)/.exec(m[6]);
    const title = m[5].replace(/\s+/g, " ").trim();
    const ci = title.lastIndexOf(": "); // last colon: "Pelikula: Ginintuang Ikalawa: Insiang" -> program is the first two parts
    rows.push({
      date: MONTHS[mo] + " " + pad(d) + ", " + y,
      dateISO: y + "-" + pad(mo + 1) + "-" + pad(d),
      day: DAYS[new Date(Date.UTC(y, mo, d)).getUTCDay()],
      location: "Manila",
      time: t ? t[1].replace(/\s+/, " ") : "",
      film: ci > 0 ? title.slice(ci + 2) : title,
      program: ci > 0 ? title.slice(0, ci) : "",
      admission: "", // ponytail: prices live on the Ticket Tailor page; card omits blank
      link: TT_BASE + m[1]
    });
  }
  return rows;
}

// Minimal CSV parser (handles quoted fields with embedded commas/newlines).
function csvRows(text) {
  const rows = [[""]]; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], r = rows[rows.length - 1];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { r[r.length - 1] += '"'; i++; } else q = false; }
      else r[r.length - 1] += ch;
    }
    else if (ch === '"') q = true;
    else if (ch === ",") r.push("");
    else if (ch === "\n") rows.push([""]);
    else if (ch !== "\r") r[r.length - 1] += ch;
  }
  return rows;
}
// "5:00 PM" -> minutes since midnight ("12:00 NN" = noon).
function timeKey(t) {
  const m = /(\d+):(\d+)\s*(AM|PM|NN|MN)?/i.exec(t || "");
  if (!m) return 0;
  let h = (+m[1]) % 12; const ap = (m[3] || "").toUpperCase();
  if (ap === "PM" || ap === "NN") h += 12;
  return h * 60 + (+m[2]);
}
// Sheet columns: DATE | DAY | (blank) | CINEMATHEQUE | TIME | FILM | PROGRAM | ADMISSION
function regionRow(c, today) {
  if (c.length < 8) return null;
  const clean = s => (s || "").replace(/\s+/g, " ").trim();
  const loc = clean(c[3]), film = clean(c[5]);
  if (!loc || /^manila$/i.test(loc) || !film) return null;
  const d = new Date(clean(c[0]));
  if (isNaN(d)) return null; // header row / blank date
  const iso = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  if (iso < today) return null;
  return { date: MONTHS[d.getMonth()] + " " + pad(d.getDate()) + ", " + d.getFullYear(), dateISO: iso,
    day: DAYS[d.getDay()], location: loc[0].toUpperCase() + loc.slice(1).toLowerCase(),
    time: clean(c[4]), film, program: clean(c[6]), admission: clean(c[7]) || "Free" };
}

(async () => {
  const [ttHtml, csv] = await Promise.all([get(TT_LIST), get(SHEET)]);
  const today = new Date(Date.now() + 8*3600*1000).toISOString().slice(0, 10); // PH today
  const byDateTime = (a, b) => a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : timeKey(a.time) - timeKey(b.time);
  const manila = parseTicketTailor(ttHtml).filter(r => r.dateISO >= today).sort(byDateTime);
  if (!manila.length) throw new Error("No Manila events parsed from the Ticket Tailor listing (layout change or blocked fetch?)");
  const regions = csvRows(csv).map(c => regionRow(c, today)).filter(Boolean).sort(byDateTime);

  let html = fs.readFileSync(CINEMATHEQUE, "utf8");
  html = html.replace(/const CC_SCHEDULE = \[[\s\S]*?\];/, "const CC_SCHEDULE = " + JSON.stringify(regions.concat(manila)) + ";");
  fs.writeFileSync(CINEMATHEQUE, html, "utf8");

  console.log("Refetched " + manila.length + " Manila rows (Ticket Tailor) + " + regions.length + " regional rows (sheet), from " + today + ":");
  manila.forEach(r => console.log("  Manila | " + r.dateISO + " " + r.time.padStart(8) + " | " + (r.program ? r.program + ": " : "") + r.film));
  regions.forEach(r => console.log("  " + r.location.padEnd(6) + " | " + r.dateISO + " " + r.time.padStart(8) + " | " + r.film));
})();
