// Check the hero-swap logic: only 2026-05 exists (matches live), everything
// else 404s. Asserts requests are paid once, swaps are instant when warm, and
// a rapid click can't be overwritten by a slower older probe.
const fs = require("fs");
const assert = require("assert");
const src = fs.readFileSync(process.argv[2], "utf8");
const script = src.slice(src.indexOf("<script>") + 8, src.lastIndexOf("</script>"));

// Fresh page-load. `pending` holds probe outcomes until flush(), so a probe
// can be left in flight -- that is how the token-guard case is set up.
function load() {
  let requests = [], pending = [];
  global.Image = class {
    set src(u) {
      this._src = u;
      requests.push(u);
      pending.push(() => (u.includes("2026-05") ? this.onload && this.onload() : this.onerror && this.onerror()));
    }
    get src() { return this._src; }
  };
  const el = () => ({ style: {}, addEventListener() {}, appendChild() {}, removeChild() {},
                      setAttribute() {}, classList: { add() {}, remove() {} },
                      getAttribute: () => "Manila", scrollIntoView() {}, firstChild: null });
  global.window = { location: { protocol: "https:" } };
  global.document = { readyState: "complete", getElementById: el, querySelector: el,
                      querySelectorAll: () => [], createElement: el, addEventListener() {},
                      createTextNode: () => ({}) };
  global.setTimeout = (f) => f();
  global.fetch = () => new Promise(() => {});   // live fetches never settle here

  const ctx = {};
  new Function("with(this){" + script +
    "\nthis._x = {setHeroImage, resolveHeroUrl, prewarmHeroes};}").call(ctx);
  return Object.assign(ctx._x, {
    reqs: () => requests,
    clear: () => (requests = []),
    flush: () => { while (pending.length) pending.shift()(); },
  });
}

// --- cold: probe walks the 404s, fades out, fades in only once loaded ---
{
  const h = load();
  h.flush();                       // drain ccInit's own probes
  h.clear();
  const img = { style: {} };
  h.setHeroImage(img, "Negros");
  // ccInit prewarmed Negros, so this is already resolved: no fade, no request.
  assert.deepStrictEqual(h.reqs(), [], "prewarm makes the first click free");
  assert.strictEqual(img.style.opacity, "1", "warm swap never fades out");
  assert.match(img.src, /2026-05\/negros\.webp$/, "resolved to the live folder");
}

// --- a genuinely cold location: fades out, resolves, fades back in ---
{
  const h = load();
  const img = { style: {} };
  h.setHeroImage(img, "Iloilo");
  assert.strictEqual(img.style.opacity, "0", "fades out while probing cold");
  assert.strictEqual(img.src, undefined, "src untouched until a candidate loads");
  h.flush();
  assert.match(img.src, /2026-05\/iloilo\.webp$/, "resolved to the live folder");
  assert.strictEqual(img.style.opacity, "1", "faded back in only after load");
}

// --- repeat swaps cost nothing ---
{
  const h = load();
  h.flush();
  const img = { style: {} };
  h.setHeroImage(img, "Davao"); h.flush();
  h.clear();
  h.setHeroImage(img, "Davao"); h.flush();
  assert.deepStrictEqual(h.reqs(), [], "warm swap makes no network requests");
  assert.strictEqual(img.style.opacity, "1", "warm swap never fades out");
}

// --- _heroBaseHit: once a folder is known, no location re-walks the 404s ---
{
  const h = load();
  h.flush();                       // Manila + prewarm resolved -> base is known
  h.clear();
  h.resolveHeroUrl("Somewhere", () => {});
  assert.strictEqual(h.reqs().length, 1, "no wasted 404s once a folder is known");
  assert.match(h.reqs()[0], /2026-05\//, "known-good folder tried first");
}

// --- token guard: a slow older probe must not overwrite a newer click ---
{
  const h = load();
  const img = { style: {} };
  h.setHeroImage(img, "Davao");    // cold, left in flight
  h.setHeroImage(img, "Manila");   // newer click supersedes it
  h.flush();
  assert.match(img.src, /cinema\.webp$/, "newest click wins");
  assert.strictEqual(img.alt, "Cinematheque Manila", "alt matches the winning location");
}

// --- every candidate 404s: keep what is showing, never a broken src ---
(async () => {
  const h = load();
  global.Image = class {            // nothing exists at all
    set src(u) { this._src = u; setImmediate(() => this.onerror && this.onerror()); }
    get src() { return this._src; }
  };
  const img = { style: {}, src: "/already-showing.webp" };
  h.setHeroImage(img, "Nowhere");
  // one tick per candidate folder, plus slack -- the chain is sequential
  for (let i = 0; i < 25; i++) await new Promise((r) => setImmediate(r));
  assert.strictEqual(img.src, "/already-showing.webp", "no broken src on total failure");
  assert.strictEqual(img.style.opacity, "1", "hero is never left invisible");
  console.log("hero swap OK - all 6 checks passed");
})();
