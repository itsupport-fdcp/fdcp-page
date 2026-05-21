import json

with open('schedule.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

data_js = json.dumps(data, ensure_ascii=False)

template = r"""<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Oswald:wght@500;700&display=swap');
  :root {
    --bg: #F8F8F8;
    --card-bg: #ffffff;
    --text: #1a1a1a;
    --muted: #555;
    --line: #e6e6e6;
    --grad-main: linear-gradient(135deg, #580076 0%, #E200A9 100%);
    --grad-alt:  linear-gradient(135deg, #CC8500 0%, #FFCC00 100%);
    --purple: #580076;
    --magenta: #E200A9;
    --amber: #CC8500;
    --gold: #FFCC00;
  }
  * { box-sizing: border-box; }
  .fdcp-cinematheque {
    font-family: 'Poppins', system-ui, sans-serif;
    color: var(--text);
    background: var(--bg);
    padding: 0;
    margin: 0;
    line-height: 1.5;
  }
  .fdcp-cinematheque img { max-width: 100%; display: block; }

  /* HERO */
  .cc-hero {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 6;
    min-height: 280px;
    overflow: hidden;
    border-radius: 12px;
    margin-bottom: 2.5rem;
    background: #222;
  }
  .cc-hero__img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity 0.5s ease;
  }
  .cc-hero__overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.65) 100%);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 2rem clamp(1.25rem, 5vw, 3rem);
    color: #fff;
  }
  .cc-hero__eyebrow {
    font-family: 'Oswald', sans-serif;
    letter-spacing: 0.15em;
    font-size: 0.85rem;
    color: var(--gold);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
  }
  .cc-hero__title {
    font-family: 'Oswald', sans-serif;
    font-weight: 700;
    font-size: clamp(2rem, 5vw, 3.75rem);
    line-height: 1;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .cc-hero__subtitle {
    font-size: clamp(0.95rem, 1.4vw, 1.1rem);
    color: rgba(255,255,255,0.85);
    max-width: 620px;
    margin: 0;
  }

  /* LOCATION SELECTOR */
  .cc-section-title {
    text-align: center;
    font-family: 'Oswald', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 1.5rem;
    margin: 0 0 1.75rem;
    color: var(--text);
  }
  .cc-section-title::after {
    content: "";
    display: block;
    width: 64px;
    height: 4px;
    margin: 0.65rem auto 0;
    background: var(--grad-main);
    border-radius: 2px;
  }
  .cc-locations {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    justify-content: center;
    margin-bottom: 3rem;
  }
  .cc-loc-card {
    --grad: var(--grad-main);
    position: relative;
    width: 200px;
    padding: 1.75rem 1.25rem;
    background: #fff;
    border-radius: 14px;
    cursor: pointer;
    text-align: center;
    transition: transform 0.3s cubic-bezier(.22,.61,.36,1), box-shadow 0.3s, color 0.3s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    overflow: hidden;
    isolation: isolate;
    border: 2px solid transparent;
    background-image:
      linear-gradient(#fff, #fff),
      var(--grad);
    background-origin: border-box;
    background-clip: padding-box, border-box;
  }
  .cc-loc-card { --grad: var(--grad-alt); --grad-active: var(--grad-main); }

  .cc-loc-card__label {
    font-family: 'Oswald', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.7rem;
    color: var(--muted);
    margin-bottom: 0.35rem;
  }
  .cc-loc-card__name {
    font-family: 'Oswald', sans-serif;
    font-weight: 700;
    font-size: 1.6rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    background: var(--grad);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    transition: -webkit-text-fill-color 0.3s, color 0.3s;
  }
  .cc-loc-card:hover {
    transform: scale(1.06);
    box-shadow: 0 14px 28px rgba(204,133,0,0.22);
  }
  .cc-loc-card.is-active {
    background-image: var(--grad-active), var(--grad-active);
    border-color: transparent;
    transform: scale(1.04);
    box-shadow: 0 14px 28px rgba(88,0,118,0.28);
  }
  .cc-loc-card.is-active .cc-loc-card__name {
    -webkit-text-fill-color: #fff;
    color: #fff;
    background: none;
  }
  .cc-loc-card.is-active .cc-loc-card__label {
    color: rgba(255,255,255,0.85);
  }

  /* FILM LIST */
  .cc-films-wrap {
    max-width: 760px;
    margin: 0 auto;
    padding: 0 1rem;
  }
  .cc-films-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }
  .cc-films-header h3 {
    font-family: 'Oswald', sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 1.35rem;
    margin: 0;
  }
  .cc-films-count {
    font-size: 0.85rem;
    color: var(--muted);
  }
  .cc-calendar-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    margin: -0.5rem 0 1.25rem;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--purple);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }
  .cc-calendar-link:hover {
    color: var(--magenta);
    border-bottom-color: var(--magenta);
  }
  .cc-calendar-link::after {
    content: "→";
    font-size: 1rem;
    line-height: 1;
  }
  .cc-films {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 3rem;
  }
  .cc-film-card {
    display: grid;
    grid-template-columns: 110px 1fr auto;
    gap: 1.25rem;
    align-items: center;
    background: var(--card-bg);
    border-radius: 12px;
    padding: 1.1rem 1.4rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    border-left: 5px solid transparent;
    border-image: var(--grad-main) 1;
    transition: transform 0.25s, box-shadow 0.25s;
    position: relative;
  }
  .cc-film-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 24px rgba(0,0,0,0.10);
  }
  .cc-film-card[data-program-color="alt"] {
    border-image: var(--grad-alt) 1;
  }

  .cc-date {
    background: var(--grad-main);
    color: #fff;
    border-radius: 10px;
    padding: 0.55rem 0.5rem;
    text-align: center;
    font-family: 'Oswald', sans-serif;
    line-height: 1.1;
    min-width: 90px;
  }
  .cc-film-card[data-program-color="alt"] .cc-date {
    background: var(--grad-alt);
    color: #2a1a00;
  }
  .cc-date__month {
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    opacity: 0.9;
  }
  .cc-date__day {
    font-size: 1.7rem;
    font-weight: 700;
    line-height: 1;
    margin: 0.15rem 0;
  }
  .cc-date__year {
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    opacity: 0.85;
  }

  .cc-info__program {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--purple);
    font-weight: 600;
    margin-bottom: 0.25rem;
  }
  .cc-film-card[data-program-color="alt"] .cc-info__program { color: var(--amber); }
  .cc-info__title {
    font-family: 'Oswald', sans-serif;
    font-weight: 600;
    font-size: 1.2rem;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin: 0 0 0.3rem;
    color: var(--text);
  }
  .cc-info__meta {
    font-size: 0.9rem;
    color: var(--muted);
  }
  .cc-info__meta strong { color: var(--text); font-weight: 600; }

  .cc-cta {
    display: inline-block;
    padding: 0.55rem 1.1rem;
    border-radius: 999px;
    background: var(--grad-main);
    color: #fff;
    font-size: 0.78rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: transform 0.2s, filter 0.2s;
    white-space: nowrap;
  }
  .cc-film-card[data-program-color="alt"] .cc-cta {
    background: var(--grad-alt);
    color: #2a1a00;
  }
  .cc-cta:hover { transform: translateY(-1px); filter: brightness(1.05); }

  .cc-walkin {
    display: inline-block;
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    background: transparent;
    color: var(--amber);
    border: 1.5px solid var(--amber);
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    white-space: nowrap;
  }

  .cc-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin: 0.5rem 0 2rem;
  }
  .cc-page-btn {
    min-width: 36px;
    height: 36px;
    padding: 0 0.7rem;
    border-radius: 8px;
    border: 1px solid #ddd;
    background: #fff;
    color: var(--text);
    font-family: 'Poppins', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  .cc-page-btn:hover:not(:disabled) {
    border-color: var(--purple);
    color: var(--purple);
  }
  .cc-page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .cc-page-btn.is-active {
    background: var(--grad-main);
    color: #fff;
    border-color: transparent;
  }

  .cc-empty {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--muted);
    background: #fff;
    border-radius: 12px;
    border: 1px dashed var(--line);
  }

  /* RESPONSIVE */
  @media (max-width: 720px) {
    .cc-hero { aspect-ratio: 16 / 9; }
    .cc-loc-card { width: 45%; min-width: 140px; padding: 1.25rem 0.75rem; }
    .cc-loc-card__name { font-size: 1.3rem; }
    .cc-film-card {
      grid-template-columns: 80px 1fr;
      gap: 0.9rem;
      padding: 0.9rem 1rem;
    }
    .cc-cta { grid-column: 1 / -1; justify-self: start; margin-top: 0.4rem; }
    .cc-date { min-width: 70px; padding: 0.4rem; }
    .cc-date__day { font-size: 1.4rem; }
    .cc-info__title { font-size: 1.05rem; }
  }
</style>

<div class="fdcp-cinematheque">
  <div class="cc-hero">
    <img id="ccHeroImg" class="cc-hero__img" src="/sites/default/files/2026-05/cinema.webp" alt="Cinematheque Manila">
    <div class="cc-hero__overlay">
      <div class="cc-hero__eyebrow">FDCP Exhibition</div>
      <h1 class="cc-hero__title" id="ccHeroTitle">Cinematheque Manila</h1>
      <p class="cc-hero__subtitle">Experience the best of Philippine and world cinema at FDCP&rsquo;s Cinematheque Centers. Select a location below to view its current film schedule.</p>
    </div>
  </div>

  <h2 class="cc-section-title">Choose a Cinematheque</h2>
  <div class="cc-locations" id="ccLocations">
    <div class="cc-loc-card is-active" data-loc="Manila">
      <div class="cc-loc-card__label">Cinematheque</div>
      <div class="cc-loc-card__name">Manila</div>
    </div>
    <div class="cc-loc-card" data-loc="Negros">
      <div class="cc-loc-card__label">Cinematheque</div>
      <div class="cc-loc-card__name">Negros</div>
    </div>
    <div class="cc-loc-card" data-loc="Iloilo">
      <div class="cc-loc-card__label">Cinematheque</div>
      <div class="cc-loc-card__name">Iloilo</div>
    </div>
    <div class="cc-loc-card" data-loc="Davao">
      <div class="cc-loc-card__label">Cinematheque</div>
      <div class="cc-loc-card__name">Davao</div>
    </div>
  </div>

  <div class="cc-films-wrap">
    <div class="cc-films-header">
      <h3 id="ccFilmsHeading" class="cc-films-heading">Now Showing in Manila</h3>
      <span id="ccFilmsCount" class="cc-films-count">Loading...</span>
    </div>
    <a id="ccCalendarLink" class="cc-calendar-link" href="#" target="_blank" rel="noopener">See full calendar</a>
    <div id="ccFilms" class="cc-films">
      <div class="cc-empty">Loading screenings...</div>
    </div>
    <div id="ccPagination" class="cc-pagination">&nbsp;</div>
  </div>
</div>

<script>
const CC_SCHEDULE = __DATA__;

// ─── MONTH FILTER ────────────────────────────────────────────────────────────
// Show ONE month at a time. Format: "YYYY-MM". Use "" (empty) to show ALL.
// Uncomment ONLY the line for the month you want.
const MONTH_FILTER = "2026-05";   // May 2026
// const MONTH_FILTER = "2026-06";   // June 2026
// const MONTH_FILTER = "2026-07";   // July 2026
// const MONTH_FILTER = "";          // show all months
// ─────────────────────────────────────────────────────────────────────────────

// ─── HERO IMAGE FOLDER ───────────────────────────────────────────────────────
// Images live in a month-named folder inside Drupal's public files, e.g.
//   /sites/default/files/2026-05/cinema.webp
//   /sites/default/files/2026-05/davao.webp
// The folder name uses the current MONTH_FILTER automatically. If MONTH_FILTER
// is empty (show all), it falls back to a generic "cinematheque" folder.
const ASSET_BASE = "/sites/default/files/" + (MONTH_FILTER || "cinematheque") + "/";
// Map each location to its image file name (without extension).
const LOC_IMAGES = { "Manila": "cinema", "Negros": "negros", "Iloilo": "iloilo", "Davao": "davao" };
// ─────────────────────────────────────────────────────────────────────────────

// ─── MANILA "VIEW DETAILS" LINK ──────────────────────────────────────────────
// Manila film cards show a "View Details" button. Replace this URL when ready.
// Other locations show "Walk-in only" instead of a button.
const MANILA_DETAILS_URL = "#";
// ─────────────────────────────────────────────────────────────────────────────

// ─── "SEE FULL CALENDAR" LINKS (per location) ────────────────────────────────
// Shown just under the "Now Showing in ..." heading. Set "" to hide.
const CALENDAR_URLS = {
  "Manila": "https://sites.google.com/fdcp.gov.ph/cinemathequemanila/more/calendar?authuser=0",
  "Negros": "",
  "Iloilo": "",
  "Davao":  ""
};
// ─────────────────────────────────────────────────────────────────────────────

const ALT_PROGRAMS = new Set(["Negros", "Iloilo"]);
const PAGE_SIZE = 10;
var ccCurrentPage = 1;

function monthAbbr(iso) {
  if (!iso) return "";
  const m = new Date(iso + "T00:00:00").toLocaleString("en-US", { month: "short" });
  return m.toUpperCase();
}
function dayNum(iso) { return iso ? new Date(iso + "T00:00:00").getDate() : ""; }
function yearNum(iso) { return iso ? new Date(iso + "T00:00:00").getFullYear() : ""; }

function makeEl(tag, className, text) {
  var el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function buildCard(r, altLoc) {
  var card = makeEl("div", "cc-film-card");
  card.setAttribute("data-program-color", altLoc);

  var date = makeEl("div", "cc-date");
  date.appendChild(makeEl("div", "cc-date__month", monthAbbr(r.dateISO)));
  date.appendChild(makeEl("div", "cc-date__day", dayNum(r.dateISO)));
  date.appendChild(makeEl("div", "cc-date__year", yearNum(r.dateISO)));
  card.appendChild(date);

  var info = makeEl("div", "cc-info");
  info.appendChild(makeEl("div", "cc-info__program", r.program));
  info.appendChild(makeEl("h4", "cc-info__title", r.film));

  var meta = makeEl("div", "cc-info__meta");
  var timeStrong = makeEl("strong", null, r.time);
  meta.appendChild(timeStrong);
  meta.appendChild(document.createTextNode("  ·  " + r.admission + "  ·  " + r.day));
  info.appendChild(meta);
  card.appendChild(info);

  if (r.location === "Manila") {
    var link = makeEl("a", "cc-cta", "View Details");
    link.href = MANILA_DETAILS_URL;
    link.target = "_blank";
    link.rel = "noopener";
    card.appendChild(link);
  } else {
    card.appendChild(makeEl("span", "cc-walkin", "Walk-in Only"));
  }

  return card;
}

function findOne(id, cls) {
  return document.getElementById(id) || document.querySelector("." + cls);
}

function renderPagination(totalPages, location) {
  var pager = findOne("ccPagination", "cc-pagination");
  if (!pager) return;
  while (pager.firstChild) pager.removeChild(pager.firstChild);
  if (totalPages <= 1) return;

  function pageBtn(label, page, opts) {
    opts = opts || {};
    var b = makeEl("button", "cc-page-btn", label);
    b.type = "button";
    if (opts.active) b.classList.add("is-active");
    if (opts.disabled) b.disabled = true;
    else b.addEventListener("click", function () { gotoPage(page, location); });
    return b;
  }

  pager.appendChild(pageBtn("‹ Prev", ccCurrentPage - 1, { disabled: ccCurrentPage === 1 }));
  for (var p = 1; p <= totalPages; p++) {
    pager.appendChild(pageBtn(String(p), p, { active: p === ccCurrentPage }));
  }
  pager.appendChild(pageBtn("Next ›", ccCurrentPage + 1, { disabled: ccCurrentPage === totalPages }));
}

function gotoPage(page, location) {
  ccCurrentPage = page;
  renderFilms(location);
  var wrap = document.querySelector(".cc-films-wrap");
  if (wrap) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderFilms(location) {
  var list = CC_SCHEDULE.filter(function (r) {
    return r.location === location &&
      (!MONTH_FILTER || r.dateISO.slice(0, 7) === MONTH_FILTER);
  });
  var heading = findOne("ccFilmsHeading", "cc-films-heading");
  var count = findOne("ccFilmsCount", "cc-films-count");
  var container = findOne("ccFilms", "cc-films");
  if (!container) return;

  var totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (ccCurrentPage > totalPages) ccCurrentPage = 1;
  var start = (ccCurrentPage - 1) * PAGE_SIZE;
  var pageItems = list.slice(start, start + PAGE_SIZE);

  if (heading) heading.textContent = "Now Showing in " + location;
  var calLink = findOne("ccCalendarLink", "cc-calendar-link");
  if (calLink) {
    var url = CALENDAR_URLS[location] || "";
    if (url) { calLink.href = url; calLink.style.display = ""; }
    else { calLink.style.display = "none"; }
  }
  if (count) {
    var label = list.length + " screening" + (list.length === 1 ? "" : "s");
    if (list.length > PAGE_SIZE) {
      label += " (page " + ccCurrentPage + " of " + totalPages + ")";
    }
    count.textContent = label;
  }

  while (container.firstChild) container.removeChild(container.firstChild);

  if (!list.length) {
    container.appendChild(makeEl("div", "cc-empty",
      "No upcoming screenings for this Cinematheque yet. Check back soon."));
    renderPagination(0, location);
    return;
  }

  var altLoc = ALT_PROGRAMS.has(location) ? "alt" : "main";
  for (var i = 0; i < pageItems.length; i++) {
    container.appendChild(buildCard(pageItems[i], altLoc));
  }
  renderPagination(totalPages, location);
}

function selectLocation(loc) {
  var cards = document.querySelectorAll(".cc-loc-card");
  for (var i = 0; i < cards.length; i++) {
    var d = cards[i].getAttribute("data-loc");
    if (d === loc) cards[i].classList.add("is-active");
    else cards[i].classList.remove("is-active");
  }
  var img = findOne("ccHeroImg", "cc-hero__img");
  if (img) {
    img.style.opacity = "0";
    setTimeout(function () {
      img.src = ASSET_BASE + (LOC_IMAGES[loc] || loc.toLowerCase()) + ".webp";
      img.alt = "Cinematheque " + loc;
      img.style.opacity = "1";
    }, 200);
  }
  var title = findOne("ccHeroTitle", "cc-hero__title");
  if (title) title.textContent = "Cinematheque " + loc;
  ccCurrentPage = 1;
  renderFilms(loc);
}

function ccInit() {
  var locs = findOne("ccLocations", "cc-locations");
  if (locs) {
    locs.addEventListener("click", function (e) {
      var card = e.target.closest(".cc-loc-card");
      if (card) selectLocation(card.getAttribute("data-loc"));
    });
  }
  var heroImg = findOne("ccHeroImg", "cc-hero__img");
  if (heroImg) heroImg.src = ASSET_BASE + (LOC_IMAGES["Manila"] || "cinema") + ".webp";
  renderFilms("Manila");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ccInit);
} else {
  ccInit();
}
</script>
"""

html = template.replace("__DATA__", data_js)

with open('cinematheque.html', 'w', encoding='utf-8') as f:
    f.write(html)
print(f'Wrote cinematheque.html ({len(html):,} chars, {len(data)} schedule rows)')
