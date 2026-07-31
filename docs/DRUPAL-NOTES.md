# Drupal CKEditor notes

Drupal's text-format filter has bitten this project enough times that
I'm writing it down. If you paste a snippet into a page or block and it
shows up unstyled or broken on the live site, the filter has probably
stripped something. Read this before adding markup, or when something
that worked locally suddenly renders as plain text on production.

`CLAUDE.md` is gitignored, so this file is where the notes live.

---

## What this repo is

fdcp.ph runs on Drupal. The theme, nav, header, footer, and the
cinematheque/fdcp_theme custom theme all live in the Drupal install.
None of that is in this repo.

What's in here is a few standalone HTML snippets — one per page or
block where we needed more design control than Drupal's page builder
gives. Each `.html` file in the root maps to a different page or
block on the live site.

### How a snippet ends up on the site

1. A Drupal admin creates a Basic Page (e.g. `/upcoming-events-live`)
   or a Custom Block (e.g. the homepage "Upcoming Event" region) and
   picks the **Full HTML** text format.
2. Open the matching `.html` from this repo, switch CKEditor to
   **Source** view, and paste the file body in.
3. Save. The visitor's browser gets the Drupal page chrome (header,
   nav, footer) wrapped around our pasted snippet.

No build step on the Drupal side. What's in the local file is what
lands in the page body.

### One repo, separate pages

| File | Where it shows up on the live site |
| --- | --- |
| [upcoming-events.html](upcoming-events.html) | Calendar of Events page — hero, stats band, FDCP Event Calendar, filtered + paginated events list |
| [event-details.html](event-details.html) | Single-event detail page (`/event-details?id=<slug>`) |
| [homepage-upcoming-events-snippet.html](homepage-upcoming-events-snippet.html) | Custom block on the homepage's "Upcoming Event" region |
| [cinematheque.html](cinematheque.html) | Cinematheque page — generated from `schedule.json` by `build.py` |

These files don't import each other and don't share JS modules. Each
file is its own `<style>`, its own `<script>`, its own copy of any
helper function it needs. They look like one product on the live
site because they reuse the same colors and patterns, not because
they're wired together.

Shared bits:

- Purple `#580076`, magenta `#E200A9`, gold `#FFCC00`, off-white `#F5F2FF`
- Primary gradient `linear-gradient(90deg,#580076 0%,#E200A9 100%)` on titles, primary CTAs, active chips
- Same date-tile design across every event card
- `fdcp-` ID prefix; `data-field="..."` attributes mark spots the JS fills from sheet rows
- `fdcp.events.v4` localStorage key shared by every page that reads the Google Sheet

### Adding a new page

1. Copy the closest existing snippet as a starting point. Sheet-driven
   list → `upcoming-events.html`. Detail-style page →
   `event-details.html`.
2. Keep the colors and gradients. Brand tokens are in `CLAUDE.md`
   locally — purple for brand text and the title gradient, `#F5F2FF`
   for date-tile backgrounds, the orange/gold gradient
   (`#FFD24D → #F5A623`) on View Details buttons.
3. Copy the helper functions you need into the new file's `<script>` —
   `parseGvizHTML`, `cellToText`, `sanitizeRichHTML`, `parseSheetDate`,
   `normalizePoster`, `slugify`, `loadEventsSWR`, `setText`,
   `killTopSpacing`. They handle sheet parsing, the SWR cache, and the
   Drupal cascade quirks.
4. Same Google Sheet → same cache key (`fdcp.events.v4`). All
   sheet-driven pages share that one entry so the first paint is
   instant on a return visit. Bump the version (`v5`, `v6`, …) only
   if the row shape changes.
5. Follow the defensive patterns below so the filter doesn't gut your
   styles.
6. Hand it to the Drupal admin — which URL alias or block region,
   text format must be Full HTML, paste via the Source view.

---

## The one rule

If a style has to render correctly on the live site, write it inline
as `style="..."` on the element. Treat the `<style>` block and any
`class="..."` attribute as things Drupal *might* strip.

Classes are still useful for hover/focus and theming — just don't
make them the only delivery vector for layout that has to work.

---

## What Drupal can strip

The text-format filter runs between the Source-view paste and the
rendered page. Depending on the content type and text format, any of
these can happen:

| What | When | Symptom |
| --- | --- | --- |
| The whole `<style>` block | Stricter block text formats | Cards / chips / pagination show up as plain text — no pills, no rounded corners |
| `class="..."` attributes | Some block contexts | Tailwind utilities and custom classes (`fdcp-chip`, `fdcp-page-btn`) silently do nothing |
| `<section>`, `<nav>`, `<article>`, `<aside>` | Block contexts, even on Full HTML | Element gets unwrapped; children survive, the wrapper's styling doesn't |
| Children of `<template>` | Always | Card markup inside `<template>` disappears |
| Empty `<span></span>` / `<p></p>` | Always | Placeholders meant for JS to fill vanish before the JS runs |
| Specific CSS properties | Rare | Saw `-webkit-text-fill-color:transparent` get dropped, leaving invisible text on a gradient bg |
| Tailwind utilities missing from the compiled CSS | Always (just a missing class name) | `self-end`, `gap-10`, `flex-col-reverse`, etc. don't apply |

Full HTML on a Basic Page is the most permissive context. Custom
Blocks tend to run a tighter format and strip more. If a snippet
works on `/upcoming-events-live` but renders broken inside a block,
the filter difference is almost always why.

---

## Patterns

### Inline critical layout

If a flex/grid layout, padding, or background has to render right,
write it on the element:

```html
<div id="fdcp-stats-band"
     style="background:#fff;padding:48px 16px;overflow-x:hidden;">
  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
              gap:8px;max-width:1280px;margin:0 auto;align-items:center;">
    ...
  </div>
</div>
```

Verbose, but that's the price. Keep the nice-to-haves (hover,
transitions, focus rings) in the `<style>` block — those can fall
through without breaking anything.

### Plain `<div>` for structural wrappers

Don't reach for `<section>`, `<nav>`, `<article>`, `<aside>` — they
get unwrapped by stricter filters. A `<div>` with `role` and
`aria-label` reads the same to assistive tech and survives:

```html
<!-- Loses its background if a block filter unwraps the section -->
<section id="fdcp-stats-band" aria-label="Stats">…</section>

<!-- Inline styles ride along with the div -->
<div id="fdcp-stats-band" aria-label="Stats"
     style="background:#fff;padding:48px 16px;">…</div>
```

### Drupal's Tailwind is a subset

The Drupal theme ships a precompiled Tailwind. Only the utilities the
theme actually uses are baked in. Anything we add via these snippets
that isn't already in that build just doesn't apply.

Confirmed missing on the live site:

- `self-end`, `self-start`, `self-center`
- `flex-col-reverse`
- `gap-10`, `gap-32`, most non-trivial `gap-*` values
- Arbitrary-value classes (`lg:gap-32`, `text-[44px]`) — sometimes
  compiled, sometimes not. Don't trust them for anything that has to
  render.

When a property matters, inline it. Example — pinning View Details
to the right of the card regardless of which Tailwind utilities
happened to compile:

```html
<a href="#" class="rounded-full ..."
   style="align-self:flex-end; margin-left:auto; flex-shrink:0;
          background:linear-gradient(90deg,#FFD24D 0%,#F5A623 100%);
          color:#1a1a1a;">View Details</a>
```

Those two style props together work in both flex directions —
`align-self:flex-end` handles the column case (mobile),
`margin-left:auto` handles the row case (desktop).

### JS-generated elements: set style per instance

Anything `document.createElement(...)` and appended at runtime —
pagination buttons, chip state, month headers, day-event modal items
— has to get its style set on each instance:

```js
var PAGE_BTN_BASE =
  "min-width:40px;min-height:40px;padding:0 12px;border-radius:9999px;" +
  "background:#fff;color:#374151;font-size:14px;font-weight:600;" +
  "display:inline-flex;align-items:center;justify-content:center;" +
  "border:1px solid #E5E7EB;cursor:pointer;";

var btn = document.createElement("button");
btn.textContent = "Next ›";
btn.setAttribute("style", PAGE_BTN_BASE);
container.appendChild(btn);
```

Keep the style strings as module-scope constants
(`PAGE_BTN_BASE`, `CHIP_STYLE_ACTIVE`, `CHIP_STYLE_INACTIVE`) so the
update points stay in one place. `renderPagination()` and
`applyChipStyle()` in [upcoming-events.html](upcoming-events.html)
follow this pattern.

### State toggles rewrite the inline style

If the matching CSS rule got stripped, a class swap visually changes
nothing. Rewrite the `style` attribute when state changes:

```js
function applyChipStyle(btn, active) {
  btn.setAttribute("style", active ? CHIP_STYLE_ACTIVE : CHIP_STYLE_INACTIVE);
}

// chip click handler
document.querySelectorAll('#fdcp-events-filters button').forEach(function (b) {
  var active = b === clickedBtn;
  b.classList.toggle('fdcp-chip-active', active);
  b.setAttribute('aria-pressed', active ? 'true' : 'false');
  applyChipStyle(b, active);
});
```

### CTA buttons and dates use Poppins

All pill-style CTA buttons (arrow chips, "Visit Gallery" links, etc.) and event date spans (`#fdcp-event-date`) must set `font-family:'Poppins',sans-serif` inline. Drupal's Tailwind theme inherits a different body font, so omitting it lets the browser fall through to the theme's default.

```html
<!-- CTA button -->
<a href="..." style="...;font-family:'Poppins',sans-serif;font-weight:600;font-size:13px;...">
  Label
</a>

<!-- Event date -->
<span id="fdcp-event-date" style="font-family:'Poppins',sans-serif;font-weight:600;...">—</span>
```

---

### Gradient text needs a solid color fallback

`background-clip:text; -webkit-text-fill-color:transparent;` has been
chipped down by the filter before. When the fill-color rule goes,
the text becomes transparent on the gradient bg — invisible.

Pair gradient text with a solid `color` of the same hue:

```html
<span style="font-size:32px;font-weight:800;color:#580076;">12</span>
```

If text-clip works in the rendered environment, the gradient shows.
If not, you still see solid purple. `#580076` is the safe fallback
(it's the gradient's starting color).

### No `<template>` for card markup

The filter strips the children of `<template>` — the wrapper element
survives but its inner HTML is gone, so any
`template.content.cloneNode(true)` breaks.

Build card markup as a JS string:

```js
var CARD_HTML = [
  '<div class="...">',
    '<span data-field="title">—</span>',
    ...
  '</div>'
].join("");

function buildCard(row) {
  var holder = document.createElement("div");
  holder.innerHTML = CARD_HTML;
  var node = holder.firstElementChild;
  setText(node, "title", row["Event"]);
  return node;
}
```

### Empty inline elements get removed

`<span></span>` and `<p></p>` with no text inside get stripped. If
you need a placeholder for JS to fill later, put something in — an
em dash or `&nbsp;` both work:

```html
<!-- Span gets stripped before the JS can populate it -->
<span data-field="location"></span>

<!-- Em-dash placeholder survives -->
<span data-field="location">—</span>
```

### `applyBaseStyles()` is the safety net

[upcoming-events.html](upcoming-events.html) has a function called
`applyBaseStyles()` that runs on init and writes inline styles for
elements that were originally styled via classes — calendar grid,
weekday header, toolbar, modal. It exists for the case where the
`<style>` block went missing entirely. Match the pattern when you
add new structural elements that absolutely have to paint.

### Don't strip `!important` from `<style>` blocks

The `!important` flags in our `<style>` blocks aren't lazy. They
protect against Drupal's theme cascade, which will otherwise
override our layout with unrelated theme rules. Leave them in.

---

## Pasting workflow

1. Preview locally first — `file://` or a local static server. The
   `LOCAL-PREVIEW ONLY` block at the top of each file loads Tailwind
   via CDN so the layout works outside Drupal.
2. In CKEditor, switch to **Source** view, paste the full file, save.
3. Don't flip back to WYSIWYG before saving — it'll re-mangle the
   markup (escape `<style>`, drop inline scripts, etc.).
4. Check the live page. If anything renders as plain text or loses
   layout, the filter stripped something — inline the affected
   element's styles and re-paste.
5. The text format has to be **Full HTML**. Restricted or Basic
   HTML formats strip `<style>`, `<script>`, and most of the
   structural markup.

---

## After-paste checks

After pasting any snippet, eyeball the live page:

- Stats-band numbers visible in brand purple, not white.
- Chips, pagination, and View Details render as pills with rounded corners — not plain text.
- Cards are spaced apart, sticky month headers don't overlap.
- Mobile: calendar's `+N more` indicators stay inside the week cell.
- Hero → next section has breathing room, not a hard seam.
- Console clean — no `Could not load events`, no `unexpected token`.

If any of those look off, the fix is almost always inlining the
affected element's styles.

---

## Files that exercise these patterns

- [upcoming-events.html](upcoming-events.html) — most complete
  example. Stats band, filter chips, pagination, sticky month
  headers, calendar with viewport-aware row sizing, two card
  variants (poster + posterless).
- [event-details.html](event-details.html) — empty-element
  placeholder pattern in the location row.
- [homepage-upcoming-events-snippet.html](homepage-upcoming-events-snippet.html)
  — pasted into a block, so it runs under the strictest filter we
  deal with.

If something's stuck, the stats band and pagination in
`upcoming-events.html` are the most filter-resistant pieces we have
— copy that inline-style approach.
