/**
 * FDCP Cinematheque — live data proxy (schedule + film links)
 * ------------------------------------------------------------------
 * Runs on Google's servers (where no-CORS / no-API-key restrictions
 * don't apply) and returns everything the cinematheque page needs:
 *
 *   {
 *     "schedule": [ { date, dateISO, day, location, time, film,
 *                     program, admission }, ... ],   // Manila, live
 *     "links":    { "macho dancer": "https://.../macho-dancer", ... }
 *   }
 *
 *   - schedule  comes from the SAME public Google Calendar that powers
 *               the Cinematheque Manila Google Site (its public .ics
 *               feed — no API key, no billing).
 *   - links     are scraped from the Google Site /programs pages so the
 *               "View Details" buttons deep-link to the exact film page.
 *
 * SETUP (one time, ~5 minutes):
 *   1. Go to https://script.google.com (any FDCP Google account).
 *   2. New project -> delete the default code -> paste this file.
 *   3. Deploy -> New deployment -> type "Web app"
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   4. Copy the web app URL (https://script.google.com/macros/s/.../exec)
 *      and paste it into CINE_DATA_PROXY in cinematheque.html.
 *
 * After that it is fully automatic: every time the page loads it pulls
 * the current schedule and film links. When the team updates the Google
 * Calendar or publishes a new film page, it shows up on the next load
 * (results are cached 10 min to stay fast). To force an instant refresh,
 * open the web app URL with ?nocache=1 once.
 */

var SITE = "https://sites.google.com/fdcp.gov.ph/cinemathequemanila";
var CAL_ID = "c_297715d58563f4dc6de17c9db206013d959c7d422b00f1a65fd73329bd9579d2@group.calendar.google.com";
var ICS_URL = "https://calendar.google.com/calendar/ical/"
  + encodeURIComponent(CAL_ID) + "/public/basic.ics";

var MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
var DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
var PAID_PROGRAMS = {
  "fdcp presents: a curation of world cinema": "Php 150.00",
  "pelikula ng bayan": "Php 150.00"
};
var PROGRAM_BY_FILM = {
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

function doGet(e) {
  var noCache = e && e.parameter && e.parameter.nocache;
  var cache = CacheService.getScriptCache();
  var json = noCache ? null : cache.get("cineData");
  if (!json) {
    var links = buildLinks_();
    var schedule = buildSchedule_().filter(function (row) {
      return !!links[normalize_(row.film)];
    });
    json = JSON.stringify({
      schedule: schedule,
      links: links
    });
    cache.put("cineData", json, 600); // 10 min
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- SCHEDULE (Manila, from public ICS) ---------------- */

function buildSchedule_() {
  var ics = fetch_(ICS_URL);
  if (!ics) return [];
  ics = ics.replace(/\r\n/g, "\n").replace(/\n /g, ""); // unfold long lines
  var blocks = ics.split("BEGIN:VEVENT").slice(1);
  var rows = [];
  blocks.forEach(function (b) {
    var row = eventToRow_(b);
    if (row) rows.push(row);
  });
  return rows;
}

function eventToRow_(block) {
  var summary = field_(block, "SUMMARY");
  var dt = field_(block, "DTSTART");
  if (!summary || !dt) return null;
  summary = unescapeIcs_(summary);
  if (/^cinematheque director series:/i.test(summary)) return null;
  if (/closed for private|private event/i.test(summary)) return null;

  var y, mo, d, h = 0, mi = 0, timed = false, dow;
  if (/^\d{8}T/.test(dt)) {
    y = +dt.slice(0, 4); mo = +dt.slice(4, 6) - 1; d = +dt.slice(6, 8);
    h = +dt.slice(9, 11); mi = +dt.slice(11, 13);
    var ms = Date.UTC(y, mo, d, h, mi) + 8 * 3600 * 1000; // UTC -> PH
    var pd = new Date(ms);
    y = pd.getUTCFullYear(); mo = pd.getUTCMonth(); d = pd.getUTCDate();
    h = pd.getUTCHours(); mi = pd.getUTCMinutes(); dow = pd.getUTCDay();
    timed = true;
  } else {
    y = +dt.slice(0, 4); mo = +dt.slice(4, 6) - 1; d = +dt.slice(6, 8);
    dow = new Date(Date.UTC(y, mo, d)).getUTCDay();
  }

  var iso = y + "-" + pad_(mo + 1) + "-" + pad_(d);
  var time = "";
  if (timed) {
    var ap = h >= 12 ? "PM" : "AM";
    time = (h % 12 || 12) + ":" + pad_(mi) + " " + ap;
  }
  var program = programFromDesc_(field_(block, "DESCRIPTION"), summary);
  var admission = PAID_PROGRAMS[program.toLowerCase()] || "Free";
  return {
    date: MONTHS[mo] + " " + pad_(d) + ", " + y,
    dateISO: iso, day: DAYS[dow], location: "Manila",
    time: time, film: summary, program: program, admission: admission
  };
}

// DESCRIPTION is "<b>Director</b><br>Program<br><br>Synopsis" -> 2nd line.
function programFromDesc_(desc, film) {
  var known = PROGRAM_BY_FILM[normalize_(film)];
  if (known) return known;
  if (/^cinematheque director series:/i.test(film || "")) {
    return "Cinematheque Director Series";
  }
  if (!desc) return "";
  // Split on <br> FIRST so the separators survive, THEN strip tags.
  var parts = unescapeIcs_(desc)
    .split(/<br\s*\/?>/i)
    .map(function (s) { return s.replace(/<[^>]+>/g, "").trim(); })
    .filter(function (s) { return s; });
  if (parts.length < 2) return "";
  // Shorts/special format leads with the film title (no director line) and
  // the 2nd line is a film list, not a program -> default to Pelikulaya.
  if (film && parts[0].toLowerCase().indexOf(film.toLowerCase().slice(0, 12)) === 0) return "Pelikulaya";
  return parts[1];
}

function field_(block, name) {
  var m = block.match(new RegExp("\\n" + name + "[^:\\n]*:(.*)"));
  return m ? m[1] : "";
}

// ICS escapes: \, \; \n \\
function unescapeIcs_(s) {
  return s.replace(/\\n/gi, " ").replace(/\\,/g, ",")
          .replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

/* ---------------- FILM LINKS (scraped from Google Site) -------------- */

function buildLinks_() {
  var links = {};
  // The Screenings page is the source of truth for currently published film
  // cards, including programs that are not yet listed on the Programs index.
  addPathsToLinks_(links, fetch_(SITE + "/screenings?authuser=0"));

  // Keep crawling program pages as well so older links remain available.
  var indexHtml = fetch_(SITE + "/programs?authuser=0");
  extractPaths_(indexHtml, 1).forEach(function (folder) {
    var progHtml = fetch_(SITE + "/programs/" + folder + "?authuser=0");
    addPathsToLinks_(links, progHtml);
  });
  if (links["afan short film set"]) links["afan shorts"] = links["afan short film set"];
  return links;
}

function addPathsToLinks_(links, html) {
  extractPaths_(html, 2).forEach(function (path) {
    var slug = path.split("/")[1];
    var key = slug.replace(/-/g, " ").replace(/\s+/g, " ").trim();
    links[key] = SITE + "/programs/" + path + "?authuser=0";
  });
}

function extractPaths_(html, depth) {
  var re = /\/fdcp\.gov\.ph\/cinemathequemanila\/programs\/([a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)/g;
  var seen = {}, out = [], m;
  while ((m = re.exec(html)) !== null) {
    var p = m[1];
    if (p.split("/").length === depth && !seen[p]) {
      seen[p] = true;
      out.push(p);
    }
  }
  return out;
}

/* ---------------- shared ---------------- */

function pad_(n) { return String(n).length < 2 ? "0" + n : "" + n; }
function normalize_(s) {
  return (s || "").toLowerCase()
    .replace(/[^a-z0-9'": ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fetch_(url) {
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true
    });
    return res.getResponseCode() === 200 ? res.getContentText() : "";
  } catch (e) {
    return "";
  }
}
