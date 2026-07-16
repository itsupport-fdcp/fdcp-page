// Refetch Manila schedule from the live public Google Calendar and rewrite
// CC_SCHEDULE in cinematheque.html. Run:  node refetch-manila.js
// ponytail: manual refetch until the Apps Script proxy is deployed.
const fs = require("fs"), https = require("https");

const CAL = "c_297715d58563f4dc6de17c9db206013d959c7d422b00f1a65fd73329bd9579d2@group.calendar.google.com";
const ICS = "https://calendar.google.com/calendar/ical/" + encodeURIComponent(CAL) + "/public/basic.ics";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const PAID = { "fdcp presents: a curation of world cinema": "Php 150.00", "pelikula ng bayan": "Php 150.00" };

function get(url) {
  return new Promise((res, rej) => https.get(url, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return get(r.headers.location).then(res, rej);
    let d = ""; r.on("data", c => d += c); r.on("end", () => res(d));
  }).on("error", rej));
}
const field = (b, n) => { const m = b.match(new RegExp("(?:^|\\n)" + n + "[^:\\n]*:(.*)")); return m ? m[1] : ""; };
const unesc = s => s.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").replace(/\s+/g, " ").trim();
const pad = n => String(n).length < 2 ? "0" + n : "" + n;
function prog(d, film) {
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

(async () => {
  const ics = (await get(ICS)).replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const today = new Date(Date.now() + 8*3600*1000).toISOString().slice(0, 10); // PH today
  const manila = ics.split("BEGIN:VEVENT").slice(1).map(row).filter(Boolean).filter(r => r.dateISO >= today)
    .sort((a, b) => a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1 : (a.time < b.time ? -1 : 1));

  let html = fs.readFileSync("cinematheque.html", "utf8");
  const sched = JSON.parse(html.match(/const CC_SCHEDULE = (\[[\s\S]*?\]);/)[1]);
  const combined = sched.filter(r => r.location !== "Manila").concat(manila);
  html = html.replace(/const CC_SCHEDULE = \[[\s\S]*?\];/, "const CC_SCHEDULE = " + JSON.stringify(combined) + ";");
  fs.writeFileSync("cinematheque.html", html, "utf8");

  console.log("Refetched " + manila.length + " Manila rows (from " + today + "):");
  manila.forEach(r => console.log("  " + r.dateISO + " " + r.time.padStart(8) + " | " + r.film));
})();
