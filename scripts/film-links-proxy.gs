/**
 * FDCP Cinematheque — live Manila schedule proxy (Ticket Tailor)
 * ------------------------------------------------------------------
 * Returns the live Manila schedule for pages/cinematheque.html:
 *
 *   {
 *     "schedule": [ { date, dateISO, day, location, time, film,
 *                     program, admission, link }, ... ],
 *     "links": {},          // legacy field, kept so older pages don't break
 *     "source": "api" | "scrape" | "cache",
 *     "debug":  { ... }     // present only when a live pull failed
 *   }
 *
 * The page has NO baked fallback any more -- whatever this returns is what
 * visitors see -- so this script is deliberately defensive:
 *   - it serves a LAST-GOOD copy (up to 6h old) when a live pull fails,
 *     so one blocked fetch never blanks the page;
 *   - it never caches a failure;
 *   - when it does come back empty it says why, in `debug`.
 *
 * TWO WAYS TO GET THE DATA
 *   1. Official API (set TT_API_KEY below). REQUIRED in practice: Ticket
 *      Tailor fronts its public pages with a Cloudflare bot challenge that
 *      Google's server IPs fail ("Just a moment..." / HTTP 403 -- verified
 *      2026-09-03), so scraping from Apps Script does not work.
 *   2. Scraping the public listing page (no key). Kept as a fallback only.
 * With a key set it tries the API first and falls back to scraping.
 *
 * GETTING AN API KEY: Ticket Tailor dashboard -> Settings -> API keys ->
 * create one, paste it into TT_API_KEY. It stays on Google's servers and is
 * never exposed to the browser.
 *
 * DEPLOYING AN UPDATE (URL stays the same):
 *   Deploy -> Manage deployments -> pencil icon -> Version: New version -> Deploy
 *   ("New deployment" instead mints a DIFFERENT /exec URL -- don't use it.)
 * Then check: <exec-url>?nocache=1
 */

// ---- CONFIG -------------------------------------------------------------
var TT_API_KEY = "sk_17657_205812_bd170fbdb947919800caabdf7c83e9e7";   // optional; blank = scrape the public listing page
var TT_BASE  = "https://www.tickettailor.com";
var TT_LIST  = TT_BASE + "/events/fdcpexhibition";
var TT_API_HOST = "https://api.tickettailor.com";
var TT_API_MAX_PAGES = 5;   // 100/page; follows links.next until null

// Published occurrences from the start of today (PH time) onward. Without the
// start_at filter the API returns the box office's whole history oldest-first
// (verified: page 1 was July 2025), so current shows might never be reached.
function apiUrl_() {
  var nowPH = new Date(Date.now() + 8 * 3600 * 1000);
  var todayPH = Date.UTC(nowPH.getUTCFullYear(), nowPH.getUTCMonth(), nowPH.getUTCDate()) / 1000 - 8 * 3600;
  return TT_API_HOST + "/v1/events?limit=100&status=published&start_at.gte=" + todayPH;
}
var CACHE_OK_SECS   = 600;    // fresh copy
var CACHE_LAST_SECS = 21600;  // last-good copy (6h, CacheService max)
// -------------------------------------------------------------------------

var MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
var DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function doGet(e) {
  var noCache = e && e.parameter && e.parameter.nocache;
  var cache = CacheService.getScriptCache();

  if (!noCache) {
    var fresh = cache.get("cineData");
    if (fresh) return json_(fresh);
  }

  var result = buildSchedule_();

  if (result.schedule.length) {
    var payload = JSON.stringify({
      schedule: result.schedule, links: {}, source: result.source
    });
    cache.put("cineData", payload, CACHE_OK_SECS);
    cache.put("cineLast", payload, CACHE_LAST_SECS);
    return json_(payload);
  }

  // Live pull failed. Serve the last good copy rather than blanking the page.
  var last = cache.get("cineLast");
  if (last) {
    var revived = JSON.parse(last);
    revived.source = "cache";
    revived.debug = result.debug;
    return json_(JSON.stringify(revived));
  }
  return json_(JSON.stringify({ schedule: [], links: {}, debug: result.debug }));
}

function json_(s) {
  return ContentService.createTextOutput(s)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------- SCHEDULE ---------------------------------- */

// Returns { schedule, source, debug }. Never throws.
function buildSchedule_() {
  var tried = [];

  if (TT_API_KEY) {
    var headers = {
      // Ticket Tailor uses HTTP Basic with the key as the username, blank password.
      "Authorization": "Basic " + Utilities.base64Encode(TT_API_KEY + ":"),
      "Accept": "application/json"
    };
    var rows = [], next = apiUrl_(), pages = 0, api = null;
    // Cursor pagination: links.next is relative to /v1 and looks like
    // "/events/?starting_after=ev_123&..." (verified live), null on the last page.
    while (next && pages < TT_API_MAX_PAGES) {
      api = fetchOnce_(next, headers);
      pages++;
      tried.push({ how: "api", page: pages, code: api.code, err: api.err });
      if (api.code !== 200) break;
      var parsed = parseApi_(api.body);
      rows = rows.concat(parsed.rows);
      next = parsed.next ? apiAbs_(parsed.next) : null;
    }
    if (rows.length) return { schedule: sort_(rows), source: "api", debug: null };
  }

  var page = fetchOnce_(TT_LIST, browserHeaders_());
  tried.push({ how: "scrape", code: page.code, err: page.err });
  if (page.code === 200 && page.body.indexOf("event__link") !== -1) {
    var scraped = parseListing_(page.body);
    if (scraped.length) return { schedule: sort_(scraped), source: "scrape", debug: null };
    tried[tried.length - 1].note = "page fetched but no rows parsed (markup changed?)";
  }

  return {
    schedule: [],
    source: "none",
    debug: {
      tried: tried,
      apiKeySet: !!TT_API_KEY,
      snippet: (page.body || "").replace(/\s+/g, " ").slice(0, 300)
    }
  };
}

function sort_(rows) {
  rows.sort(function (a, b) {
    return a.dateISO < b.dateISO ? -1 : a.dateISO > b.dateISO ? 1
      : timeKey_(a.time) - timeKey_(b.time);
  });
  return rows;
}

// Shared row shape. Titles read "Program: Film"; split on the LAST ": " so
// "Pelikula: Ginintuang Ikalawa: Insiang" keeps the two-part program name.
function row_(title, y, mo, d, time, link) {
  var ci = title.lastIndexOf(": ");
  return {
    date: MONTHS[mo] + " " + pad_(d) + ", " + y,
    dateISO: y + "-" + pad_(mo + 1) + "-" + pad_(d),
    day: DAYS[new Date(Date.UTC(y, mo, d)).getUTCDay()],
    location: "Manila",
    time: time,
    film: ci > 0 ? title.slice(ci + 2) : title,
    program: ci > 0 ? title.slice(0, ci) : "",
    admission: "",   // prices live on the Ticket Tailor page; card omits blank
    link: link
  };
}

/* ------------------------- SOURCE: official API -------------------------- */

// /v1/events returns one object per occurrence (verified against a live
// FDCP response, 2026-09-03):
//   { object:"event", id:"ev_6248792", event_series_id:"es_1747724",
//     name:"Pelikulaya: Flee", status:"published",
//     url:"https://www.tickettailor.com/events/fdcpexhibition/1747724",
//     start:{ date:"2025-07-03", time:"13:00", iso:"...+08:00", unix:1751518800 } }
// Returns { rows, next } where next is links.next (relative path) or null.
function parseApi_(body) {
  var json;
  try { json = JSON.parse(body) || {}; } catch (err) { return { rows: [], next: null }; }
  var data = json.data || [];
  var todayUnix = Math.floor(Date.now() / 1000) - 24 * 3600; // keep today's shows
  var out = [];
  for (var i = 0; i < data.length; i++) {
    var ev = data[i] || {};
    var start = ev.start || {};
    var iso = String(start.date || "");            // "YYYY-MM-DD"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !ev.name) continue;
    if (start.unix && start.unix < todayUnix) continue;   // past occurrence
    // The API includes events the public listing deliberately omits
    // (verified live: a private invite-only screening). Mirror the listing.
    if (String(ev.private) === "true" || String(ev.hidden) === "true") continue;
    var series = String(ev.event_series_id || ev.id || "").replace(/^[a-z]+_/, "");
    // ev.url is the series page without a date (verified live:
    // ".../events/fdcpexhibition/1747724"). Pin it to this occurrence so a
    // multi-date series opens on the right day, matching the public listing.
    var base = ev.url || (TT_LIST + "/" + series);
    var link = base.indexOf("?") === -1 ? base + "?date=" + iso : base;
    out.push(row_(
      String(ev.name).replace(/\s+/g, " ").trim(),
      +iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10),
      to12h_(start.time),
      link
    ));
  }
  return { rows: out, next: (json.links && json.links.next) || null };
}

// links.next comes back as "/events/?..." (relative to /v1) -- occasionally
// documented as "/v1/events?...". Accept both, and a full URL.
function apiAbs_(next) {
  if (/^https?:\/\//.test(next)) return next;
  if (next.indexOf("/v1/") === 0) return TT_API_HOST + next;
  return TT_API_HOST + "/v1" + (next.charAt(0) === "/" ? "" : "/") + next;
}

// "16:00" -> "4:00 PM"
function to12h_(hhmm) {
  var m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  if (!m) return "";
  var h = +m[1];
  return (h % 12 || 12) + ":" + m[2] + " " + (h >= 12 ? "PM" : "AM");
}

/* ------------------------- SOURCE: listing scrape ------------------------ */

// One <li> per occurrence: the event__link anchor holds the detail URL
// (?date=YYYY-MM-DD) and the title; the meta chunk before
// event-meta__location holds the start time.
function parseListing_(html) {
  var u = unescapeEntities_(html);
  var re = /href="(\/events\/[a-z0-9_-]+\/\d+\?date=(\d{4})-(\d{2})-(\d{2}))" class="event__link">([^<]+)<\/a>([\s\S]*?)event-meta__location/g;
  var out = [], m;
  while ((m = re.exec(u)) !== null) {
    var t = /(\d{1,2}:\d{2}\s*[AP]M)/.exec(m[6]);
    out.push(row_(
      m[5].replace(/\s+/g, " ").trim(),
      +m[2], +m[3] - 1, +m[4],
      t ? t[1].replace(/\s+/, " ") : "",
      TT_BASE + m[1]
    ));
  }
  return out;
}

// The listing entity-escapes attribute values (&#x2F; etc.).
function unescapeEntities_(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/* ------------------------------- shared --------------------------------- */

function pad_(n) { return String(n).length < 2 ? "0" + n : "" + n; }

// "5:00 PM" -> minutes since midnight.
function timeKey_(t) {
  var m = /(\d+):(\d+)\s*(AM|PM)?/i.exec(t || "");
  if (!m) return 0;
  var h = (+m[1]) % 12;
  if ((m[3] || "").toUpperCase() === "PM") h += 12;
  return h * 60 + (+m[2]);
}

// Ticket Tailor 403s bare requests (verified: no User-Agent -> 403,
// browser User-Agent -> 200), so look like a real navigation.
function browserHeaders_() {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none"
  };
}

// Single attempt. Returns { code, err, body } and never throws, so a failure
// can be reported instead of vanishing into an empty schedule.
function fetchOnce_(url, headers) {
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: headers
    });
    return { code: res.getResponseCode(), err: "", body: res.getContentText() };
  } catch (err) {
    return { code: -1, err: String(err), body: "" };
  }
}
