// Refetch the full cinematheque schedule and rewrite CC_SCHEDULE in
// pages/cinematheque.html. Run:  node scripts/refetch-manila.js  (any cwd)
//   - Manila: from the live public Google Calendar (.ics)
//   - Negros / Iloilo / Davao: from the schedule Google Sheet (CSV). The page
//     also re-fetches this sheet live on every visit (loadSheetRegions), so
//     the baked regional rows are just the instant-paint fallback.
//   - Manila detail links: from the live Google Sites Screenings page.
// ponytail: manual refetch until the Apps Script proxy is deployed.
const fs = require("fs"), https = require("https"), path = require("path");
const CINEMATHEQUE = path.join(__dirname, "..", "pages", "cinematheque.html");

const CAL = "c_297715d58563f4dc6de17c9db206013d959c7d422b00f1a65fd73329bd9579d2@group.calendar.google.com";
const ICS = "https://calendar.google.com/calendar/ical/" + encodeURIComponent(CAL) + "/public/basic.ics";
const SHEET = "https://docs.google.com/spreadsheets/d/1Bu-vxwXmJpTGYH3OpE6Z83Fs7513uPeVZYB7_-fjBl8/gviz/tq?tqx=out:csv";
const SITE = "https://sites.google.com/fdcp.gov.ph/cinemathequemanila";
const SCREENINGS = SITE + "/screenings?authuser=0";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const PAID = { "fdcp presents: a curation of world cinema": "Php 150.00", "pelikula ng bayan": "Php 150.00" };
const PROGRAM_BY_FILM = {
  "the only child in the butchery": "AFAN Boot Camp Film Screenings",
  "breaking the cycle": "AFAN Boot Camp Film Screenings",
  "cleaners": "AFAN Boot Camp Film Screenings",
  "afan shorts": "AFAN Boot Camp Film Screenings",
  "blooming": "AFAN Boot Camp Film Screenings",
  "horizon": "AFAN x Mongolian Cinema Days",
  "public enemy": "AFAN x Mongolian Cinema Days",
  "disorder": "AFAN x Mongolian Cinema Days",
  "foggy hilltop": "AFAN x Mongolian Cinema Days"
};

function get(url) {
  return new Promise((res, rej) => https.get(url, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return get(r.headers.location).then(res, rej);
    let d = ""; r.on("data", c => d += c); r.on("end", () => res(d));
  }).on("error", rej));
}
const field = (b, n) => { const m = b.match(new RegExp("(?:^|\\n)" + n + "[^:\\n]*:(.*)")); return m ? m[1] : ""; };
const unesc = s => s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").replace(/\s+/g, " ").trim();
const pad = n => String(n).length < 2 ? "0" + n : "" + n;
const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9'": ]/g, " ").replace(/\s+/g, " ").trim();
function prog(d, film) {
  const known = PROGRAM_BY_FILM[normalize(film)];
  if (known) return known;
  if (/^cinematheque director series:/i.test(film || "")) return "Cinematheque Director Series";
  if (!d) return "";
  const p = unesc(d).split(/<br\s*\/?>/i).map(s => s.replace(/<[^>]+>/g, "").trim()).filter(Boolean);
  if (p.length < 2) return "";
  if (film && p[0].toLowerCase().indexOf(film.toLowerCase().slice(0, 12)) === 0) return "Pelikulaya";
  return p[1];
}
function row(b) {
  let s = field(b, "SUMMARY"), dt = field(b, "DTSTART");
  if (!s || !dt) return null;
  s = unesc(s);
  if (/^cinematheque director series:/i.test(s)) return null;
  if (/closed for private|private event/i.test(s)) return null;
  let y, mo, d, h = 0, mi = 0, timed = false, dow;
  if (/^\d{8}T/.test(dt)) {
    y = +dt.slice(0,4); mo = +dt.slice(4,6)-1; d = +dt.slice(6,8); h = +dt.slice(9,11); mi = +dt.slice(11,13);
    const pd = new Date(Date.UTC(y,mo,d,h,mi) + 8*3600*1000);
    y = pd.getUTCFullYear(); mo = pd.getUTCMonth(); d = pd.getUTCDate(); h = pd.getUTCHours(); mi = pd.getUTCMinutes(); dow = pd.getUTCDay(); timed = true;
  } else { y = +dt.slice(0,4); mo = +dt.slice(4,6)-1; d = +dt.slice(6,8); dow = new Date(Date.UTC(y,mo,d)).getUTCDay(); }
  if (!timed) return null;
  const ap = h >= 12 ? "PM" : "AM";
  const pr = prog(field(b, "DESCRIPTION"), s);
  return { date: MONTHS[mo] + " " + pad(d) + ", " + y, dateISO: y + "-" + pad(mo+1) + "-" + pad(d),
    day: DAYS[dow], location: "Manila", time: (h % 12 || 12) + ":" + pad(mi) + " " + ap,
    film: s, program: pr, admission: PAID[pr.toLowerCase()] || "Free" };
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

// Levenshtein distance, capped: bails early when lengths differ by > 2.
function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Auto-heal small calendar-vs-site spelling drifts (e.g. calendar "Iti
// Mapupukaw" vs site slug "iti-mapukpukaw"): a film with no exact link that
// is within edit distance 2 of exactly ONE link key gets aliased to it. The
// alias is baked into the links map, so the page's lookup resolves too.
function healLinkTypos(rows, links) {
  rows.forEach(r => {
    const key = normalize(r.film);
    if (links[key] || key.length < 6) return;
    const near = Object.keys(links).filter(k => editDist(key, k) <= 2);
    if (near.length === 1) {
      links[key] = links[near[0]];
      console.log('  Healed | "' + key + '" -> "' + near[0] + '" (spelling drift)');
    }
  });
}

function siteFilmLinks(html) {
  const links = {};
  const re = /\/fdcp\.gov\.ph\/cinemathequemanila\/programs\/([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const path = match[1];
    const slug = path.split("/")[1];
    links[slug.replace(/-/g, " ")] = SITE + "/programs/" + path + "?authuser=0";
  }
  if (links["afan short film set"]) links["afan shorts"] = links["afan short film set"];
  return links;
}

function renderFilmLinks(links) {
  const rows = Object.keys(links).sort().map(key =>
    "  " + JSON.stringify(key) + ": " + JSON.stringify(links[key]) + ","
  );
  if (rows.length) rows[rows.length - 1] = rows[rows.length - 1].replace(/,$/, "");
  return [
    "  // BEGIN AUTO-REFETCHED FILM LINKS",
    ...rows,
    "  // END AUTO-REFETCHED FILM LINKS"
  ].join("\n");
}

(async () => {
  const [icsRaw, csv, screeningsHtml] = await Promise.all([get(ICS), get(SHEET), get(SCREENINGS)]);
  const ics = icsRaw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const today = new Date(Date.now() + 8*3600*1000).toISOString().slice(0, 10); // PH today
  const byDateTime = (a, b) => a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : timeKey(a.time) - timeKey(b.time);
  const links = siteFilmLinks(screeningsHtml);
  if (!Object.keys(links).length) throw new Error("No film-detail links found on the Google Sites Screenings page");
  const manilaAll = ics.split("BEGIN:VEVENT").slice(1).map(row).filter(Boolean).filter(r => r.dateISO >= today).sort(byDateTime);
  healLinkTypos(manilaAll, links);
  const manila = manilaAll.filter(r => !!links[normalize(r.film)]);
  const skipped = manilaAll.filter(r => !links[normalize(r.film)]);
  const regions = csvRows(csv).map(c => regionRow(c, today)).filter(Boolean).sort(byDateTime);

  let html = fs.readFileSync(CINEMATHEQUE, "utf8");
  html = html.replace(/const CC_SCHEDULE = \[[\s\S]*?\];/, "const CC_SCHEDULE = " + JSON.stringify(regions.concat(manila)) + ";");
  const linkBlock = /  \/\/ BEGIN AUTO-REFETCHED FILM LINKS[\s\S]*?  \/\/ END AUTO-REFETCHED FILM LINKS/;
  if (!linkBlock.test(html)) throw new Error("Auto-refetched film-link block not found in cinematheque.html");
  html = html.replace(linkBlock, renderFilmLinks(links));
  fs.writeFileSync(CINEMATHEQUE, html, "utf8");

  console.log("Refetched " + manila.length + " Manila rows (calendar) + " + regions.length + " regional rows (sheet) + " + Object.keys(links).length + " film links (Google Site), from " + today + ":");
  manila.forEach(r => console.log("  Manila | " + r.dateISO + " " + r.time.padStart(8) + " | " + r.film));
  skipped.forEach(r => console.log("  Skipped| " + r.dateISO + " " + r.time.padStart(8) + " | " + r.film + " (no exact detail page)"));
  regions.forEach(r => console.log("  " + r.location.padEnd(6) + " | " + r.dateISO + " " + r.time.padStart(8) + " | " + r.film));
  Object.keys(links).sort().forEach(key => console.log("  Link   | " + key + " -> " + links[key]));
})();
