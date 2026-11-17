import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/playwright/index.mjs";

const OUT = "/Users/jamie.mills/c9h/code/shad-wpp-proof/gallery";
const BASE = "/Users/jamie.mills/c9h/code/shad-wpp/parity/reports";
const RADIX = "/Users/jamie.mills/c9h/code/shad-wpp-radix/parity/reports";
const SKIP = new Set(["summary","coverage-matrix","owners","a11y","a11y-exceptions","a11y-production","a11y-production-subset","browser-matrix","t011-parity-evidence","ssr","interaction","commands"]);
const VIEWPORTS = ["1440x900", "390x844"];

function loadReports(dir) {
  const out = new Map();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const key = file.replace(/\.json$/, "");
    if (SKIP.has(key)) continue;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      if (!Array.isArray(r.results) || !r.results.length) continue;
      out.set(key, r);
    } catch {}
  }
  return out;
}
const base = loadReports(BASE);
const radix = loadReports(RADIX);
const components = [...new Set([...base.keys(), ...radix.keys()])].sort();
function stateMap(report, viewport) {
  const map = new Map();
  if (!report) return map;
  for (const r of report.results) {
    if (r.viewport !== viewport || !r.panel) continue;
    const area = r.panel.width * r.panel.height || 1;
    map.set(r.state, { pct: (r.pixelDiff / area) * 100, pixels: r.pixelDiff });
  }
  return map;
}
function colour(pct) {
  if (pct === undefined) return "#d8d3cb";
  if (pct === 0) return "#1f8a4c";
  if (pct <= 0.5) return "#d99200";
  if (pct <= 2) return "#e0568e";
  if (pct <= 5) return "#a80050";
  return "#5f002f";
}
const dot = (worst) => (worst === 0 ? "#2e9e5b" : worst <= 0.5 ? "#c98a12" : "#c0392b");

const browser = await chromium.launch();
for (const viewport of VIEWPORTS) {
  const stateMaterial = (slug, viewportName, state) => {
    const stateSlug = String(state).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const metaFile = path.join(OUT, "shots", slug, `${viewportName}--${stateSlug}.json`);
    if (!fs.existsSync(metaFile)) return true; // unknown -> treat as visible
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    return [...(meta.baseRegions ?? []), ...(meta.radixRegions ?? [])].some((region) => !region.aaOnly);
  };
  const rows = components.map((name) => {
    const b = stateMap(base.get(name), viewport);
    const r = stateMap(radix.get(name), viewport);
    const states = [...new Set([...b.keys(), ...r.keys()])];
    const worst = Math.max(0, ...[...b.values(), ...r.values()].map((x) => x.pct));
    const bExact = [...b.values()].filter((x) => x.pixels === 0).length;
    const rExact = [...r.values()].filter((x) => x.pixels === 0).length;
    const incomplete = b.size === 0 || r.size === 0;
    const slug = name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    const kinds = { base: {}, radix: {} };
    let visible = false;
    let aaOnly = false;
    for (const state of states) {
      const be = b.get(state);
      const re = r.get(state);
      if (be) {
        if (be.pixels === 0) kinds.base[state] = "exact";
        else if (stateMaterial(slug, viewport, state)) { kinds.base[state] = "visible"; visible = true; }
        else { kinds.base[state] = "aa"; aaOnly = true; }
      } else kinds.base[state] = "unmeasured";
      if (re) {
        if (re.pixels === 0) kinds.radix[state] = "exact";
        else if (stateMaterial(slug, viewport, state)) { kinds.radix[state] = "visible"; visible = true; }
        else { kinds.radix[state] = "aa"; aaOnly = true; }
      } else kinds.radix[state] = "unmeasured";
    }
    const kind = visible ? "visible" : aaOnly ? "aa" : Object.values(kinds.base).includes("unmeasured") || Object.values(kinds.radix).includes("unmeasured") ? "unmeasured" : "exact";
    const stateCounts = { base: { exact: 0, visible: 0, aa: 0, unmeasured: 0 }, radix: { exact: 0, visible: 0, aa: 0, unmeasured: 0 } };
    for (const key of ["base", "radix"]) for (const k of Object.values(kinds[key])) stateCounts[key][k] += 1;
    const bLabel = b.size === 0 ? "B not measured" : `B ${bExact}/${b.size} exact`;
    const rLabel = r.size === 0 ? "R not measured" : `R ${rExact}/${r.size} exact`;
    return { name, states: states.map((s) => ({ s, b: b.get(s), r: r.get(s) })), worst, incomplete, visible, aaOnly, kind, stateCounts, counts: `${bLabel} · ${rLabel}` };
  });
  const hasPage = (name) => fs.existsSync(path.join(OUT, "components", `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}.html`));
  const sq = (row, s, which) => {
    const v = which === "b" ? s.b : s.r;
    const pct = v?.pct;
    const title = `${row.name} · ${s.s}: ${pct === undefined ? "not measured" : pct.toFixed(3) + "%"}`;
    const style = `background:${colour(pct)}`;
    if (pct !== undefined && pct > 0 && hasPage(row.name)) {
      const slug = row.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      const stateSlug = String(s.s).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
      const statePage = `components/${slug}--${stateSlug}.html`;
      const href = fs.existsSync(path.join(OUT, statePage)) ? statePage : `components/${slug}.html`;
      return `<a class="sq" href="${href}" title="${title} — open this state side-by-side" style="${style}"></a>`;
    }
    return `<i class="sq" title="${title}" style="${style}"></i>`;
  };
  const totals = { base: { exact: 0, visible: 0, aa: 0, unmeasured: 0 }, radix: { exact: 0, visible: 0, aa: 0, unmeasured: 0 } };
  for (const row of rows) {
    for (const key of ["base", "radix"]) for (const k of Object.keys(totals[key])) totals[key][k] += row.stateCounts[key][k];
  }
  const totalStates = rows.reduce((n, r) => n + r.states.length, 0);
  const baseStates = rows.reduce((n, r) => n + r.states.filter((s) => s.b).length, 0);
  const radixStates = rows.reduce((n, r) => n + r.states.filter((s) => s.r).length, 0);
  const zeroBase = rows.reduce((n, r) => n + r.states.filter((s) => s.b?.pixels === 0).length, 0);
  const zeroRadix = rows.reduce((n, r) => n + r.states.filter((s) => s.r?.pixels === 0).length, 0);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;background:#f2f1ee;color:#1d1c1a;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.page{width:2400px;padding:54px 64px 46px}h1{font-size:54px;line-height:1.05;margin:0 0 18px;letter-spacing:-1px}
.lede{max-width:1700px;font-size:21px;color:#3c3a37;margin:0 0 26px}
.legend{display:flex;gap:26px;align-items:center;font-size:16px;color:#3c3a37;margin:0 0 10px;flex-wrap:wrap}
.sw{display:inline-block;width:24px;height:24px;border:1px solid #d6d2cb;border-radius:3px;vertical-align:-5px;margin-right:7px}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:34px 46px;margin-top:34px}.comp{break-inside:avoid}
.name{display:flex;align-items:center;gap:9px;font-size:19px;font-weight:600;margin-bottom:9px;white-space:nowrap}
.dot{width:11px;height:11px;border-radius:50%;flex:0 0 11px}.rows{display:flex;flex-direction:column;gap:4px}
.row{display:flex;gap:4px;align-items:center}.tag{width:14px;font-size:12px;color:#8a857d;font-weight:700}
.sq{display:inline-block;width:24px;height:24px;border:1px solid #b9b2a8;border-radius:3px;text-decoration:none}
a.sq{cursor:pointer}
a.sq:hover{outline:2px solid #a80050;outline-offset:1px}
.summary{display:flex;gap:34px;flex-wrap:wrap;margin:22px 0 0;font-size:16px;color:#3c3a37}
.summary b{color:#1d1c1a}
.norows{font-size:18px;color:#5b554d;background:#fff;border:1px solid #dcd7cf;border-radius:8px;padding:18px 20px;margin:18px 0}
.toolbar{display:flex;gap:10px;align-items:center;margin:18px 0 10px;flex-wrap:wrap}
.toolbar button{font:inherit;font-size:15px;padding:7px 14px;border:1px solid #b9b2a8;border-radius:7px;background:#fff;color:#1d1c1a;cursor:pointer}
.toolbar button:hover{background:#f0ece5}
.toolbar .note{font-size:15px;color:#4a4640;margin-left:10px}
.aachip{display:inline-block;padding:3px 10px;border-radius:999px;font-weight:700;font-size:14px;background:#d8d3cb;color:#403b34}
.legend .aakey{display:flex;align-items:center;gap:8px}
.toolbar .gsep{width:1px;height:22px;background:#d5d0c7;margin:0 4px}
.toolbar button.on{background:#1d1c1a;color:#fff;border-color:#1d1c1a}
.counts{margin-top:5px;font-size:12px;color:#7a746b;letter-spacing:.2px}
.foot{margin-top:40px;font-size:15px;color:#6d6860;border-top:1px solid #dcd7cf;padding-top:18px;display:flex;justify-content:space-between}
</style></head><body><div class="page">
<h1>Proof sheet — ${viewport}</h1>
<p class="lede">Every measured component state at ${viewport}, one square per registry per state, grouped by component. WPP Open is the original web-component Storybook render (parity reference fixture). Base and Radix are the installed registries. White means no pixel differs; the deeper the magenta, the larger the share of pixels that differ. Top row in each pair is <b>B</b> = Base, bottom is <b>R</b> = Radix.</p>
<div class="legend">
<span><i class="sw" style="background:${colour(0)}"></i>exact (0%)</span>
<span><i class="sw" style="background:${colour(0.2)}"></i>up to 0.5%</span>
<span><i class="sw" style="background:${colour(1)}"></i>up to 2%</span>
<span><i class="sw" style="background:${colour(3)}"></i>up to 5%</span>
<span><i class="sw" style="background:${colour(9)}"></i>over 5%</span>
<span><i class="sw" style="background:#d8d3cb"></i>not measured</span>
<span class="aakey"><span class="aachip">AA only · not visible</span> sub-pixel edge anti-aliasing (≤5/255 per channel) — no visible or behavioural change</span>
<span style="margin-left:12px"><span class="tag">B</span> Base &nbsp; <span class="tag">R</span> Radix</span>
</div>
<div class="summary">
  <span><b>Base</b> ${totals.base.exact} exact · ${totals.base.visible} visible · ${totals.base.aa} AA-only · ${totals.base.unmeasured} not measured</span>
  <span><b>Radix</b> ${totals.radix.exact} exact · ${totals.radix.visible} visible · ${totals.radix.aa} AA-only · ${totals.radix.unmeasured} not measured</span>
</div>
<div class="toolbar"><button data-sort="name">A–Z</button><button data-sort="best">Most exact first</button><button data-sort="worst">Most different first</button><span class="gsep"></span><button data-filter="all">Show all</button><button data-filter="errors">Only differences</button><button data-filter="visible">Only visible differences</button><button data-filter="aa">Only AA (not visible)</button><span class="note">Click an amber/magenta square to open its side-by-side.</span></div>
<p id="no-rows" class="norows" style="display:none">No components match this filter.</p>
<div class="grid" id="grid">
${rows.map((row) => `<div class="comp" data-name="${row.name}" data-worst="${row.worst}" data-incomplete="${row.incomplete ? "1" : "0"}" data-visible="${row.visible ? "1" : "0"}" data-aa="${row.aaOnly && !row.visible ? "1" : "0"}" data-kind="${row.kind}"><div class="name"><span class="dot" style="background:${row.incomplete ? "#8a857d" : dot(row.worst)}"></span>${row.name}</div><div class="rows">
<div class="row"><span class="tag">B</span>${row.states.map((s) => sq(row, s, "b")).join("")}</div>
<div class="row"><span class="tag">R</span>${row.states.map((s) => sq(row, s, "r")).join("")}</div>
<div class="counts">${row.counts} exact</div>
</div></div>`).join("\n")}
</div>
<div class="foot"><span>${components.length} components · ${totalStates} states · Base ${zeroBase}/${baseStates} exact (${((zeroBase / baseStates) * 100).toFixed(1)}%) · Radix ${zeroRadix}/${radixStates} exact (${((zeroRadix / radixStates) * 100).toFixed(1)}%)</span><span>Generated 2026-11-16 · source: parity reports, ${viewport}</span></div>
</div><script>
const grid = document.getElementById('grid');
const initial = new URLSearchParams(location.search);
let sort = initial.get('sort') || 'name';
let filter = initial.get('filter') || 'all';
function apply() {
  const items = [...grid.children];
  items.sort((a, b) => {
    if (sort === 'name') return a.dataset.name.localeCompare(b.dataset.name);
    const aInc = a.dataset.incomplete === '1' ? 1 : 0;
    const bInc = b.dataset.incomplete === '1' ? 1 : 0;
    const aw = aInc ? 999 : Number(a.dataset.worst) || 0;
    const bw = bInc ? 999 : Number(b.dataset.worst) || 0;
    return sort === 'worst' ? bw - aw || a.dataset.name.localeCompare(b.dataset.name) : aw - bw || a.dataset.name.localeCompare(b.dataset.name);
  });
  for (const item of items) {
    grid.appendChild(item);
    const issue = Number(item.dataset.worst) > 0 || item.dataset.incomplete === '1';
    const visible = item.dataset.visible === '1';
    const aa = item.dataset.aa === '1';
    const hide = filter === 'errors' ? !issue : filter === 'visible' ? !visible : filter === 'aa' ? !aa : false;
    item.style.display = hide ? 'none' : '';
  }
  const noRows = document.getElementById('no-rows');
  if (noRows) {
    const any = [...grid.children].some((item) => item.style.display !== 'none');
    noRows.style.display = any ? 'none' : '';
  }
  const url = new URL(location.href);
  url.searchParams.set('filter', filter);
  history.replaceState(null, '', url);
  document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === sort));
  document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === filter));
}
document.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sort = b.dataset.sort; apply(); }));
document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; apply(); }));
apply();
</script></body></html>`;
  const htmlFile = path.join(OUT, `proof-sheet-${viewport.split("x")[0]}.html`);
  const pngFile = path.join(OUT, `proof-sheet-${viewport.split("x")[0]}.png`);
  fs.writeFileSync(htmlFile, html);
  const page = await browser.newPage({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 1 });
  await page.goto("file://" + htmlFile);
  await page.waitForTimeout(300);
  await page.screenshot({ path: pngFile, fullPage: true });
  for (const [mode, suffix] of [["errors", "differences"], ["visible", "visible"], ["aa", "aa"]]) {
    await page.click(`[data-filter="${mode}"]`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: pngFile.replace(/\.png$/, `-${suffix}.png`), fullPage: true });
  }
  await page.close();
  console.log(viewport, components.length, "components", totalStates, "states", "base", zeroBase, "/", baseStates, "radix", zeroRadix, "/", radixStates);
}
await browser.close();
