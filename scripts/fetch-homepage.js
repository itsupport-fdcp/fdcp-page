// Mirror the live filmphilippines.com homepage into staging/ as a standalone
// static site. Run:  node scripts/fetch-homepage.js  (any cwd)
//   - Downloads every first-party CSS/JS/image (and the fonts/images the CSS
//     references) under staging/ using the same paths as Drupal, so
//     root-relative URLs still work when staging/ is served as web root.
//   - Rewrites the HTML to relative paths so it also works from file:// or a
//     sub-folder. Third-party embeds (YouTube, Vimeo, Facebook, Twitter,
//     Elfsight, Curator) stay live. Google Analytics is stripped.
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "staging");
const ORIGIN = "https://filmphilippines.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const ASSET_RE = /\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|otf)(\?[^"')\s]*)?$/i;
// Hero banner video, served from S3 (not mirrored locally - it is 22MB)
const HERO_VIDEO = "https://fdcp-images.s3.ap-southeast-1.amazonaws.com/ICOF+TEASER+VID+REVISED+02.webm";

const queued = new Map(); // url path -> promise
const failed = [];

const strip = p => p.split(/[?#]/)[0];
function localPath(p) { return path.join(OUT, decodeURIComponent(strip(p))); }

async function download(p) {
  const clean = strip(p);
  if (queued.has(clean)) return queued.get(clean);
  const job = (async () => {
    const dest = localPath(clean);
    const r = await fetch(ORIGIN + clean, { headers: { "User-Agent": UA } });
    if (!r.ok) { failed.push(`${r.status} ${clean}`); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (/\.css$/i.test(clean)) fs.writeFileSync(dest, await rewriteCss(buf.toString("utf8"), clean));
    // theme bug: throws on every page without ?newscat= (live site too)
    else if (clean.endsWith("/pfeso/js/script.js")) fs.writeFileSync(dest, buf.toString("utf8").replace(
      "var newscat = location.href.match(/[?&]newscat=(.*?)(?:$|&)/)[1];",
      "var newscat = (location.href.match(/[?&]newscat=(.*?)(?:$|&)/) || [])[1];\n  if (!newscat) return;"));
    else fs.writeFileSync(dest, buf);
  })();
  queued.set(clean, job);
  return job;
}

// Resolve url()/@import refs inside a CSS file, download them, and make any
// absolute/root-relative refs relative to the CSS file itself.
async function rewriteCss(css, cssPath) {
  const dir = path.posix.dirname(cssPath);
  const refs = [];
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g, (m, q1, u1, q2, u2) => {
    let u = (u1 || u2).trim();
    if (/^(data:|#|https?:\/\/(?!filmphilippines\.com))/i.test(u) || u.startsWith("//")) return m;
    u = u.replace(/^https?:\/\/filmphilippines\.com/i, "");
    const abs = (u.startsWith("/") ? u : path.posix.normalize(dir + "/" + u)).replace(/^\/filmphilippines\//, "/");
    if (!abs.startsWith("/") || abs.startsWith("/..")) return m;
    refs.push(abs);
    const rel = path.posix.relative(dir, strip(abs)) + abs.slice(strip(abs).length);
    return m.replace(u1 || u2, rel);
  });
  await Promise.all(refs.map(download));
  return css;
}

function rewriteHtml(html) {
  // Drop analytics so staging doesn't pollute production stats.
  html = html.replace(/\s*<!-- Google tag \(gtag\.js\) -->[\s\S]*?gtag\('config'[^<]*<\/script>/, "")
    .replace(/<script src="[^"]*googleanalytics\.js[^"]*"><\/script>\n?/, "")
    .replace(/<script>\(function\(i,s,o,g,r,a,m\)[^<]*<\/script>\n?/, "")
    // d3.min.js 404s on live; script.js only references d3 inside comments
    .replace(/<script src="[^"]*\/d3\.min\.js[^"]*"><\/script>\n?/, "");
  // simple_instagram_feed scrapes instagram.com client-side; Instagram blocks
  // that (CORS) so the block only ever renders a stray "Block title" heading.
  html = html.replace(/@import url\("[^"]*simple_instagram_feed\.css[^"]*"\);\n?/, "")
    .replace(/<script src="[^"]*(simple_instagram_feed|jquery\.instagramFeed)[^"]*"><\/script>\n?/g, "")
    .replace(/<div id="block-simple-instagram-feed-simple-instagram-block"[\s\S]*?<div class="instagram-feed"><\/div>\n<\/div>\n?/, "");
  // This is a public-facing copy of the real filmphilippines.com. Keep it out of
  // search results so a staging URL can never outrank or be mistaken for the
  // live government site. Paired with staging/robots.txt below.
  html = html.replace("<head>", `<head>
<meta name="robots" content="noindex, nofollow">`);
  // The FB SDK is loaded protocol-relative ("//connect.facebook.net/..."), which
  // resolves to file://connect.facebook.net when index.html is opened directly.
  // Pinning https keeps the like-box working over file:// as well as http.
  html = html.replace(/(["'])\/\/connect\.facebook\.net\//g, "$1https://connect.facebook.net/");
  // Old dev-server logo -> live path
  html = html.replace(/https?:\/\/dev002\.glimsol\.com\/filmphilippines\//g, ORIGIN + "/");
  const refs = new Set();
  html = html.replace(/((?:src|href)=|url\()(['"]?)((?:https?:\/\/filmphilippines\.com)?\/(?:sites|misc|modules)\/[^"')\s]+)\2/g, (m, pre, q, u) => {
    const p = u.replace(/^https?:\/\/filmphilippines\.com/i, "");
    if (!ASSET_RE.test(p)) return m;
    refs.add(p);
    return `${pre}${q}${p.slice(1).split("?")[0]}${q}`;
  });
  // Hero: swap the static desktop banner still for the S3 teaser video. Matched
  // structurally (first img in the desc-only banner-wrap) so it survives the
  // editors swapping the banner image.
  //
  // Deliberately no poster. The teaser fades up from pure black (frames 0 to
  // 0.5s measure brightness 0), so the old banner still was a bright landscape
  // that cut hard to black the instant playback began. A black background
  // matches the video's own opening frame, making the swap invisible.
  let heroSwapped = false;
  html = html.replace(/(<div class="desc-only">\s*<div class="banner-wrap">\s*)<img[^>]*?src="([^"]+)"[^>]*>/,
    (m, pre) => {
      heroSwapped = true;
      return `${pre}<video class="banner-video" autoplay muted loop playsinline preload="auto"><source src="${HERO_VIDEO}" type="video/webm"></video>`;
    });
  // The theme already styles .banner-video (width/object-fit/z-index), so we add
  // only what it lacks. Every selector below is scoped to #slide-banner: this
  // touches the hero and nothing else on the page.
  //
  // The video always spans the full width and only the box ratio changes, so it
  // scales fluidly at any width while object-fit crops the 16:9 source rather
  // than stretching it:
  //   desktop  aspect-ratio 2.5     = the 1000x400 still it replaces
  //   <=992px  aspect-ratio 393/569 = the portrait mobile still (Banner 9)
  // Each matches the image that breakpoint used before, so the banner keeps its
  // exact height and nothing below it shifts. height:auto overrides the theme's
  // height:100%, which would otherwise let the 16:9 source set the height.
  //
  // Under 992px the theme hides .desc-only (display:none !important) and swaps
  // in the .mob-only still. We keep .desc-only instead so a single video element
  // serves both breakpoints; a second one in .mob-only would autoplay the same
  // 22MB file twice. Overriding that !important needs !important back.
  // brightness mirrors the theme's own rule on the img, keeping the caption legible.
  html = html.replace("</head>", `<style>
#slide-banner .banner-wrap video{height:auto;aspect-ratio:2.5;filter:brightness(.5);background:#000}
@media(max-width:992px){#slide-banner .desc-only{display:block!important}#slide-banner .mob-only{display:none!important}#slide-banner .banner-wrap video{aspect-ratio:393/569}}
</style>
</head>`);
  // Keep every video silent, for good.
  //
  // The muted attribute is only read when the element is parsed, so anything
  // re-initialising a node can bring sound back. This also has to cover the ~25
  // <video> elements the Curator.io feed injects long after load, which carry
  // real audio tracks and are the likeliest source of stray sound. A
  // MutationObserver arms each new one; the flag keeps re-arming cheap and stops
  // the volumechange handler from re-triggering itself. Audio only - no element
  // is moved, resized or restyled.
  //
  // NOTE: inject at the LAST </body>. The first one in this document sits inside
  // a Curator comment ("...before the </body> tag"), and a script injected there
  // is swallowed by the comment and never runs.
  const muteGuard = `<script>
(function(){
function silence(v){if(!v.muted||v.volume!==0){v.muted=true;v.volume=0;}}
function arm(v){if(v.__silenced)return;v.__silenced=1;silence(v);
["loadedmetadata","loadeddata","canplay","play","playing","volumechange"].forEach(function(e){
v.addEventListener(e,function(){silence(v);});});}
function sweep(){var n=document.querySelectorAll("video,audio"),i=0;for(;i<n.length;i++)arm(n[i]);}
var pending=0;
function schedule(){if(pending)return;pending=1;requestAnimationFrame(function(){pending=0;sweep();});}
sweep();
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener("visibilitychange",sweep);
})();
</script>
`;
  const endBody = html.lastIndexOf("</body>");
  html = endBody === -1 ? html + muteGuard
                        : html.slice(0, endBody) + muteGuard + html.slice(endBody);
  return { html, refs: [...refs], heroSwapped };
}

(async () => {
  const r = await fetch(ORIGIN + "/", { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error("homepage " + r.status);
  const { html, refs, heroSwapped } = rewriteHtml(await r.text());
  fs.mkdirSync(OUT, { recursive: true });
  await Promise.all(refs.map(download));
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  fs.writeFileSync(path.join(OUT, "robots.txt"), "User-agent: *\nDisallow: /\n");
  console.log(`staging/index.html written, ${queued.size} assets mirrored`);
  console.log(heroSwapped ? "hero video applied" : "WARNING: hero markup changed upstream, video NOT applied");
  if (!heroSwapped) process.exitCode = 1;
  if (failed.length) console.log("404 on the live site too (nothing to mirror):\n  " + failed.join("\n  "));
})();
