// Refetch the full cinematheque schedule and rewrite CC_SCHEDULE in
// pages/cinematheque.html. Run:  node scripts/refetch-manila.js  (any cwd)
//   - All four locations (Manila / Negros / Iloilo / Davao): from the schedule
//     Google Sheet (CSV). The page also re-fetches this sheet live on every
//     visit (loadSheetSchedule), so the baked rows are just the
//     instant-paint fallback.
//   - Manila detail links: from the live Google Sites Screenings page.
const fs = require("fs"), https = require("https"), path = require("path");
const CINEMATHEQUE = path.join(__dirname, "..", "pages", "cinematheque.html");

const SHEET = "https://docs.google.com/spreadsheets/d/1Bu-vxwXmJpTGYH3OpE6Z83Fs7513uPeVZYB7_-fjBl8/gviz/tq?tqx=out:csv";
const SITE = "https://sites.google.com/fdcp.gov.ph/cinemathequemanila";
const SCREENINGS = SITE + "/screenings?authuser=0";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// A browser-ish UA keeps the Google Site scrape on the normal HTML path.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
function get(url) {
  return new Promise((res, rej) => https.get(url, { headers: { "User-Agent": UA } }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return get(r.headers.location).then(res, rej);
    let d = ""; r.on("data", c => d += c); r.on("end", () => res(d));
  }).on("error", rej));
}
const pad = n => String(n).length < 2 ? "0" + n : "" + n;
const normalize = s => (s || "").toLowerCase().replace(/[^a-z0-9'": ]/g, " ").replace(/\s+/g, " ").trim();

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
  return { date: MONTHS[d.getMonth()] + " " + pad(d.getDate()) + ", " + d.getFullYear(), dateISO: iso,
    day: DAYS[d.getDay()], location: loc[0].toUpperCase() + loc.slice(1).toLowerCase(),
    time: clean(c[4]), film, program: clean(c[6]), admission: clean(c[7]) }; // blank stays blank -- the card omits it
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

// Auto-heal small sheet-vs-site spelling drifts (e.g. sheet "Iti
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
  const [csv, screeningsHtml] = await Promise.all([get(SHEET), get(SCREENINGS)]);
  const today = new Date(Date.now() + 8*3600*1000).toISOString().slice(0, 10); // PH today
  const byDateTime = (a, b) => a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : timeKey(a.time) - timeKey(b.time);
  const links = siteFilmLinks(screeningsHtml);
  const rows = csvRows(csv).map(c => sheetRow(c, today)).filter(Boolean).sort(byDateTime);
  if (!rows.length) throw new Error("No upcoming rows found in the schedule Google Sheet");
  // Only Manila rows render a "View Details" link, so only they need healing.
  healLinkTypos(rows.filter(r => r.location === "Manila"), links);

  let html = fs.readFileSync(CINEMATHEQUE, "utf8");
  html = html.replace(/const CC_SCHEDULE = \[[\s\S]*?\];/, "const CC_SCHEDULE = " + JSON.stringify(rows) + ";");
  const linkBlock = /  \/\/ BEGIN AUTO-REFETCHED FILM LINKS[\s\S]*?  \/\/ END AUTO-REFETCHED FILM LINKS/;
  if (!linkBlock.test(html)) throw new Error("Auto-refetched film-link block not found in cinematheque.html");
  // Keep the existing link block if the scrape came back empty (site down /
  // markup changed), rather than wiping links the page still needs.
  if (Object.keys(links).length) html = html.replace(linkBlock, renderFilmLinks(links));
  else console.warn("WARNING: no film links scraped from the Google Site -- keeping the baked link block");
  fs.writeFileSync(CINEMATHEQUE, html, "utf8");

  console.log("Refetched " + rows.length + " schedule rows (sheet) + " + Object.keys(links).length + " Manila film links (Google Site), from " + today + ":");
  rows.forEach(r => console.log("  " + r.location.padEnd(6) + " | " + r.dateISO + " " + r.time.padStart(8) + " | " + r.film +
    (r.location === "Manila" && !links[normalize(r.film)] ? "  (no detail page -> Walk-in Only)" : "")));
  Object.keys(links).sort().forEach(key => console.log("  Link   | " + key + " -> " + links[key]));
})();
