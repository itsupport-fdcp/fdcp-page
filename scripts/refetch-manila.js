// Refetch the full cinematheque schedule and rewrite CC_SCHEDULE in
// pages/cinematheque.html. Run:  node scripts/refetch-manila.js  (any cwd)
//   - All four locations (Manila / Negros / Iloilo / Davao): from the schedule
//     Google Sheet (CSV). The page also re-fetches this sheet live on every
//     visit (loadSheetSchedule), so the baked rows are just the
//     instant-paint fallback.
//   - Register links: the sheet's REGISTER LINK column (I), the only CTA
//     source the page has.
const fs = require("fs"), https = require("https"), path = require("path");
const CINEMATHEQUE = path.join(__dirname, "..", "pages", "cinematheque.html");

const SHEET = "https://docs.google.com/spreadsheets/d/1Bu-vxwXmJpTGYH3OpE6Z83Fs7513uPeVZYB7_-fjBl8/gviz/tq?tqx=out:csv";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { "User-Agent": UA } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return get(r.headers.location).then(res, rej);
    let d = ""; r.on("data", c => d += c); r.on("end", () => res(d));
  }).on("error", rej));
}
const pad = n => String(n).length < 2 ? "0" + n : "" + n;

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
function sheetRow(c, today) {
  if (c.length < 8) return null;
  const clean = s => (s || "").replace(/\s+/g, " ").trim();
  const loc = clean(c[3]), film = clean(c[5]);
  if (!loc || !film) return null;
  const d = new Date(clean(c[0]));
  if (isNaN(d)) return null; // header row / blank date
  const iso = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  if (iso < today) return null;
  const row = { date: MONTHS[d.getMonth()] + " " + pad(d.getDate()) + ", " + d.getFullYear(), dateISO: iso,
    day: DAYS[d.getDay()], location: loc[0].toUpperCase() + loc.slice(1).toLowerCase(),
    time: clean(c[4]), film, program: clean(c[6]), admission: clean(c[7]) }; // blank stays blank -- the card omits it
  // REGISTER LINK (column I). Only http(s) is baked in -- the page validates
  // again before it becomes an href, but no reason to carry junk this far.
  const link = clean(c[8]);
  if (/^https?:\/\//i.test(link)) row.link = link;
  return row;
}

(async () => {
  const csv = await get(SHEET);
  const today = new Date(Date.now() + 8*3600*1000).toISOString().slice(0, 10); // PH today
  const byDateTime = (a, b) => a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : timeKey(a.time) - timeKey(b.time);
  const rows = csvRows(csv).map(c => sheetRow(c, today)).filter(Boolean).sort(byDateTime);
  if (!rows.length) throw new Error("No upcoming rows found in the schedule Google Sheet");

  let html = fs.readFileSync(CINEMATHEQUE, "utf8");
  const baked = /const CC_SCHEDULE = \[[\s\S]*?\];/;
  if (!baked.test(html)) throw new Error("CC_SCHEDULE block not found in cinematheque.html");
  html = html.replace(baked, "const CC_SCHEDULE = " + JSON.stringify(rows) + ";");
  fs.writeFileSync(CINEMATHEQUE, html, "utf8");

  const withLink = rows.filter(r => r.link).length;
  console.log("Refetched " + rows.length + " schedule rows from the sheet, from " + today +
    " (" + withLink + " with a register link, " + (rows.length - withLink) + " walk-in):");
  rows.forEach(r => console.log("  " + r.location.padEnd(6) + " | " + r.dateISO + " " + r.time.padStart(8) +
    " | " + r.film + (r.link ? "  -> " + r.link : "  (Walk-in Only)")));
})();
