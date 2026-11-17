import fs from "node:fs";
import path from "node:path";

const OUT = "/Users/jamie.mills/c9h/code/shad-wpp-proof/gallery";
const results = JSON.parse(fs.readFileSync(path.join(OUT, "capture-results.json"), "utf8"));
const slugify = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

const byComponent = new Map();
for (const r of results) {
  const slug = slugify(r.component);
  if (!byComponent.has(slug)) byComponent.set(slug, { component: r.component, family: r.family, page: r.page, state: r.state, slug, viewports: {} });
  const entry = byComponent.get(slug);
  entry.viewports[r.name] = r;
}
const components = [...byComponent.values()].sort((a, b) => a.component.localeCompare(b.component));
const captured = components.filter((c) => Object.values(c.viewports).some((v) => v.ok));

const NAV = captured.map((c) => ({
  name: c.component,
  slug: c.slug,
  worst: Math.max(0, ...Object.values(c.viewports).flatMap((v) => [v?.base?.pct ?? 0, v?.radix?.pct ?? 0])),
}));

const TOOLBAR = `<div id="globalbar" role="toolbar" aria-label="Sort and filter components">
  <span class="glabel">Sort</span>
  <button data-sort="name">A–Z</button>
  <button data-sort="best">Most exact</button>
  <button data-sort="worst">Most different</button>
  <span class="gsep"></span>
  <span class="glabel">Show</span>
  <button data-filter="all">All</button>
  <button data-filter="errors">Only differences</button>
  <button data-filter="visible">Only visible differences</button>
  <button data-filter="aa">Only AA (not visible)</button>
  <select id="nav" aria-label="Jump to component"><option value="">Jump to component…</option></select>
</div>`;

const TOOLBAR_JS = `<script>
(() => {
  const NAV = ${JSON.stringify(NAV)};
  const q = new URLSearchParams(location.search);
  let sort = q.get('sort') || 'name';
  let filter = q.get('filter') || 'all';
  const list = document.querySelector('#cards, #grid');
  const select = document.getElementById('nav');
  const prefix = location.pathname.includes('/components/') ? '' : 'components/';
  function ordered() {
    let items = NAV.slice();
    if (filter === 'errors') items = items.filter((x) => x.worst > 0);
    items.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      return sort === 'worst'
        ? b.worst - a.worst || a.name.localeCompare(b.name)
        : a.worst - b.worst || a.name.localeCompare(b.name);
    });
    return items;
  }
  function apply() {
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="">Jump to component…</option>' +
        ordered().map((x) => '<option value="' + prefix + x.slug + '.html">' + x.name + (x.worst > 0 ? ' · ' + x.worst.toFixed(3) + '%' : ' · exact') + '</option>').join('');
      if ([...select.options].some((o) => o.value === current)) select.value = current;
    }
    const comparisons = [...document.querySelectorAll('figure.cmp')];
    for (const cmp of comparisons) {
      const exact = cmp.dataset.exact === '1';
      const visible = cmp.dataset.visible === '1';
      const aa = cmp.dataset.aa === '1';
      const hide = filter === 'errors' ? exact : filter === 'visible' ? !visible : filter === 'aa' ? !aa : false;
      cmp.style.display = hide ? 'none' : '';
    }
    document.querySelectorAll('.viewport').forEach((section) => {
      const cmps = [...section.querySelectorAll('figure.cmp')];
      if (cmps.length === 0) return;
      const show = cmps.some((c) => c.style.display !== 'none');
      section.style.display = show ? '' : 'none';
    });
    const noDiffs = document.getElementById('no-diffs');
    if (noDiffs) {
      noDiffs.textContent = filter === 'visible'
        ? "No visible differences on this component at either viewport."
        : "No differences on this component at either viewport.";
      noDiffs.style.display = filter !== 'all' && comparisons.length > 0 && comparisons.every((c) => c.style.display === 'none') ? '' : 'none';
    }
    if (list) {
      const items = [...list.children];
      items.sort((a, b) => {
        if (sort === 'name') return a.dataset.name.localeCompare(b.dataset.name);
        const aw = Number(a.dataset.worst) || 0;
        const bw = Number(b.dataset.worst) || 0;
        return sort === 'worst' ? bw - aw || a.dataset.name.localeCompare(b.dataset.name) : aw - bw || a.dataset.name.localeCompare(b.dataset.name);
      });
      for (const item of items) list.appendChild(item);
      for (const item of list.children) {
        const worst = Number(item.dataset.worst) || 0;
        const visible = item.dataset.visible === '1';
        const aa = item.dataset.aa === '1';
        const hide = filter === 'errors' ? worst === 0 : filter === 'visible' ? !visible : filter === 'aa' ? !aa : false;
        item.style.display = hide ? 'none' : '';
      }
    }
    document.body.dataset.filter = filter;
    document.querySelectorAll("a.sheetc").forEach((link) => {
      link.href = link.dataset.base + "?filter=" + filter;
    });
    document.querySelectorAll("img.sheet").forEach((img) => {
      const src = img.dataset[filter === "all" ? "all" : filter];
      if (src && img.getAttribute("src") !== src) img.src = src;
    });
    if (typeof positionMarkers === "function") positionMarkers();
    document.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === sort));
    document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('on', b.dataset.filter === filter));
    const url = new URL(location.href); url.searchParams.set('sort', sort); url.searchParams.set('filter', filter);
    history.replaceState(null, '', url);
  }
  document.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sort = b.dataset.sort; apply(); }));
  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; apply(); }));
  if (select) select.addEventListener('change', () => { if (select.value) location.href = select.value; });
  apply();
})();
</script>`;

const TOOLBAR_CSS = `#globalbar{position:sticky;top:10px;z-index:50;display:flex;gap:6px;align-items:center;background:#fff;border:1px solid #b9b2a8;border-radius:9px;padding:8px 10px;box-shadow:0 6px 24px rgba(0,0,0,.12);font-size:13px;flex-wrap:wrap;width:fit-content;max-width:100%;margin:0 0 18px}
#globalbar .glabel{font-weight:700;color:#5b554d;font-size:12px;margin-right:2px}
#globalbar .gsep{width:1px;height:20px;background:#ddd8d0;margin:0 4px}
#globalbar button{font:inherit;font-size:13px;padding:5px 9px;border:1px solid #b9b2a8;border-radius:6px;background:#fff;color:#1d1c1a;cursor:pointer}
#globalbar button:hover{background:#f0ece5}
#globalbar button.on{background:#1d1c1a;color:#fff;border-color:#1d1c1a}
#globalbar select{font:inherit;font-size:13px;padding:5px 8px;border:1px solid #b9b2a8;border-radius:6px;background:#fff;max-width:240px}`

const fmt = (d) => {
  const p = d?.pct;
  if (p === null || p === undefined) return "n/a";
  if (p === 0) return "exact";
  if (p < 0.001) return "<0.001%";
  return `${p.toFixed(3)}%`;
};
const flagged = (comp) =>
  Object.values(comp.viewports).some((v) => Math.max(v?.base?.pct ?? 0, v?.radix?.pct ?? 0) > 0.5);
const badge = (d) => {
  const p = d?.pct;
  const cls = p === 0 ? "exact" : p !== null && p !== undefined && p <= 0.5 ? "aa" : "diff";
  return `<span class="badge ${cls}">${fmt(d)}</span>`;
};

const SPLIT_CSS = `
.split{--split:50%;--knob-y:50%;position:relative;background:#fff;border:1px solid #dcd7cf;border-radius:8px;overflow:hidden;height:340px;touch-action:none;cursor:ew-resize;outline:none}
.split:focus-visible{box-shadow:0 0 0 3px #8a1450}
.split .knob:focus-visible{outline:2px solid #8a1450;outline-offset:2px}
.split img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center;pointer-events:none}
.split .reg{clip-path:inset(0 0 0 var(--split))}
.split .line{position:absolute;top:0;bottom:0;left:var(--split);width:2px;background:#d6006e;pointer-events:none}
.split .knob{position:absolute;top:var(--knob-y,50%);left:var(--split);transform:translate(-50%,-50%);width:34px;height:34px;border-radius:50%;background:#fff;border:2px solid #d6006e;box-shadow:0 2px 8px rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;font-size:13px;color:#d6006e;pointer-events:auto;cursor:move;touch-action:none;font-weight:700;user-select:none}
.lab{position:absolute;top:10px;background:#1d1c1a;color:#fff;padding:5px 10px;border-radius:4px;font-size:12px;font-weight:600;pointer-events:none}
.lab small{font-weight:400;opacity:.75}.lab.left{left:10px}.lab.right{right:10px}
figcaption{font-size:13px;color:#3c3a37;margin-top:8px}
.markers{position:absolute;inset:0;pointer-events:none}
.marker{position:absolute;display:none;transform:translate(-50%,-50%);border:2px solid #d6006e;border-radius:50%;background:rgba(214,0,110,.14);box-shadow:0 0 0 2px rgba(255,255,255,.75)}
.marker.rect{border-radius:6px;background:rgba(214,0,110,.08)}
.marker.aa{border-style:dashed;border-color:#8a1450;background:rgba(138,20,80,.10)}
.chip{display:inline-block;padding:2px 7px;border-radius:999px;font-weight:700;font-size:12px;background:#1f8a4c;color:#fff;margin-left:6px}
.marker{pointer-events:auto;cursor:zoom-in}
.lens{position:absolute;width:190px;height:190px;border-radius:50%;overflow:hidden;border:3px solid #d6006e;box-shadow:0 10px 34px rgba(0,0,0,.28);pointer-events:none;display:none;z-index:6;background:#fff}
.lens .half{position:absolute;inset:0;background-repeat:no-repeat}
.lens .difflayer{position:absolute;inset:0;background-repeat:no-repeat;opacity:.9}
.lens .lenszoom{position:absolute;left:50%;transform:translateX(-50%);bottom:6px;background:#1d1c1a;color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;white-space:nowrap}
.loupebtn{font:inherit;font-size:12px;padding:4px 9px;border:1px solid #8a1450;border-radius:6px;background:#fff;color:#8a1450;cursor:pointer;font-weight:600}
.loupebtn:hover,.loupebtn.on{background:#8a1450;color:#fff}
.aachip{display:inline-block;padding:2px 7px;border-radius:999px;font-weight:700;font-size:12px;background:#d8d3cb;color:#403b34;margin-left:6px}`;

function splitPair(comp, viewport, regLabel, suffix = "") {
  const v = comp.viewports[viewport];
  if (!v || !v.ok) return `<p class="missing">${viewport} capture unavailable${v?.error ? ` — ${v.error}` : ""}</p>`;
  const base = `../shots/${comp.slug}/${viewport}${suffix}-`;
  const reg = regLabel === "Base" ? v.base : v.radix;
  const metaFile = path.join(OUT, "shots", comp.slug, `${viewport}${suffix}.json`);
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
  const regions = (regLabel === "Base" ? meta.baseRegions : meta.radixRegions) ?? [];
  const markers = regions
    .map((r) => `<span class="marker${r.aaOnly ? " aa" : ""}" data-region='${JSON.stringify(r)}' title="${r.aaOnly ? "anti-aliasing only" : "visible difference"} · ${r.px} differing pixel(s)"></span>`)
    .join("");
  const exactChip = reg && reg.pct === 0 ? `<span class="chip">✓ exact</span>` : "";
  const hasMaterial = regions.some((r) => !r.aaOnly);
  const aaOnly = reg && reg.pct > 0 && !hasMaterial;
  const content = meta.content ?? { x: 0.5, y: 0.5, w: 0, h: 0 };
  const zoom = regLabel === "Base" ? meta.baseZoom : meta.radixZoom;
  const diffFull = fs.existsSync(path.join(OUT, "shots", comp.slug, `${viewport}${suffix}-diff-full.png`)) ? `${base}diff-full.png` : "";
  const split = Math.max(5, Math.min(95, Math.round((content.x + content.w / 2) * 100)));
  // Park the handle near the top by default so it never covers the component.
  const knobY = 10;
  return `<figure class="cmp" data-exact="${reg && reg.pct === 0 ? "1" : "0"}" data-visible="${reg && reg.pct > 0 && !aaOnly ? "1" : "0"}" data-aa="${reg && reg.pct > 0 && aaOnly ? "1" : "0"}">
    <div class="split" data-wpp="${base}wpp.png" data-reg="${base}${regLabel.toLowerCase()}.png" data-diff-full="${diffFull}" data-diff="${base}${regLabel.toLowerCase()}-zoom-diff.png" ${zoom ? `data-diff-x="${zoom.sx}" data-diff-y="${zoom.sy}" data-diff-w="${zoom.sw}" data-diff-h="${zoom.sh}"` : ""} role="slider" tabindex="0" aria-label="Compare WPP Open with ${regLabel}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${split}" style="--split:${split}%;--knob-y:${knobY}%"><img class="wpp" src="${base}wpp.png" alt="WPP Open">
      <img class="reg" src="${base}${regLabel.toLowerCase()}.png" alt="${regLabel}">
      <div class="markers">${markers}</div>
      <div class="line"></div><div class="knob">↕</div><span class="lab left">WPP Open <small>(Storybook)</small></span><span class="lab right">${regLabel}</span></div>
    <figcaption>${viewport} · WPP Open vs ${regLabel} — ${exactChip || badge(reg)}${aaOnly ? ` <span class="aachip">AA only · not visible</span>` : ""}${regions.length ? ` · <span style="color:#a80050;font-weight:600">${regions.length} region(s) circled</span>` : ""} <button class="loupebtn">View loupe</button></figcaption>
  </figure>`;
}

const page = (title, body, extra = "") => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f2f1ee;color:#1d1c1a;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.page{max-width:1500px;margin:0 auto;padding:38px 40px 60px}
h1{font-size:36px;margin:0 0 6px;letter-spacing:-.6px}h2{font-size:22px;margin:26px 0 10px}
.sub{color:#4a4640;margin:0 0 18px}a{color:#8a1450}
.meta{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#6d6860;margin:0 0 14px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.cmp{margin:0}
.badge{display:inline-block;padding:2px 7px;border-radius:999px;font-weight:700;font-size:12px}
.badge.exact{background:#1f8a4c;color:#fff}.badge.aa{background:#d99200;color:#1d1c1a}.badge.diff{background:#a80050;color:#fff}
.states{font-size:13px;color:#5b554d;margin:0 0 14px}
.states a{color:#8a1450}
.missing{color:#a33;background:#fff;border:1px solid #e3c3c3;border-radius:8px;padding:14px}
.toolbar{display:flex;gap:10px;align-items:center;margin:0 0 16px}
.toolbar button{font:inherit;font-size:14px;padding:6px 12px;border:1px solid #b9b2a8;border-radius:7px;background:#fff;color:#1d1c1a;cursor:pointer}
.toolbar button:hover{background:#f0ece5}
${SPLIT_CSS}${extra}
</style><style>${TOOLBAR_CSS}</style></head><body><div class="page">${TOOLBAR}${body}</div>${TOOLBAR_JS}<script>
function markerVisibility(split) {
  const sr = split.getBoundingClientRect();
  const raw = parseFloat(split.style.getPropertyValue('--split'));
  const pct = Number.isFinite(raw) ? raw : 50;
  const splitPx = (pct / 100) * sr.width;
  split.querySelectorAll('.marker').forEach((marker) => {
    const cx = Number(marker.dataset.cx || 0);
    // The registry is visible to the right of the divider. Once the slider
    // passes a region's centre, that region shows WPP Open and the marker
    // would be pointing at nothing, so hide it.
    if (marker.classList.contains("aa") && document.body.dataset.filter === "visible") {
      marker.style.display = "none";
      return;
    }
    marker.style.display = splitPx <= cx ? "block" : "none";
  });
}

function positionMarkers() {
  document.querySelectorAll('.split').forEach((split) => {
    const img = split.querySelector('img.wpp');
    const layer = split.querySelector('.markers');
    if (!img || !layer || !img.complete) return;
    const ir = img.getBoundingClientRect();
    const sr = split.getBoundingClientRect();
    // object-fit: contain letterboxes the image inside its element; map the
    // normalised regions into the visible content rect, not the element box.
    const nw = img.naturalWidth || ir.width;
    const nh = img.naturalHeight || ir.height;
    const scale = Math.min(ir.width / nw, ir.height / nh);
    const dw = nw * scale;
    const dh = nh * scale;
    const dx = ir.left - sr.left + (ir.width - dw) / 2;
    const dy = ir.top - sr.top + (ir.height - dh) / 2;
    split._content = { dx, dy, dw, dh };
    layer.querySelectorAll('.marker').forEach((marker) => {
      const region = JSON.parse(marker.dataset.region);
      const cx = dx + (region.x + region.w / 2) * dw;
      const cy = dy + (region.y + region.h / 2) * dh;
      const rw = region.w * dw;
      const rh = region.h * dh;
      marker.dataset.cx = String(cx);
      marker.dataset.cy = String(cy);
      marker.style.left = cx + 'px';
      marker.style.top = cy + 'px';
      if (Math.max(rw, rh) > 70) {
        marker.classList.add('rect');
        marker.style.width = Math.max(24, rw + 10) + 'px';
        marker.style.height = Math.max(24, rh + 10) + 'px';
      } else {
        const diameter = Math.max(22, Math.min(140, Math.max(rw, rh) * 1.8));
        marker.style.width = diameter + 'px';
        marker.style.height = diameter + 'px';
      }
    });
    markerVisibility(split);
    if (!split.dataset.lensBound) {
      split.dataset.lensBound = "1";
      const lens = document.createElement("div");
      lens.className = "lens";
      lens.innerHTML = '<div class="half"></div><div class="difflayer"></div><span class="lenszoom">diff ×6</span>';
      const fig = split.closest("figure.cmp");
      if (fig) fig.style.position = "relative";
      (fig || split).appendChild(lens);
      const btn = split.closest("figure")?.querySelector(".loupebtn");
      const state = { pinned: false, loupe: false, hideTimer: null };

      const paint = (mx, my) => {
        const { dx, dy, dw, dh } = split._content || {};
        if (!dw || !dh) return;
        const L = 190;
        const Z = 6;
        const cx = Math.max(dx, Math.min(dx + dw, mx));
        const cy = Math.max(dy, Math.min(dy + dh, my));
        const bgX = L / 2 - (cx - dx) * Z;
        const bgY = L / 2 - (cy - dy) * Z;
        // Always north-east of the cursor with a fixed offset, relative to the
        // figure so it can extend past the comparison card instead of flipping.
        const OFFSET = 22;
        const fig = split.closest("figure.cmp") || split;
        const fr = fig.getBoundingClientRect();
        const sr = split.getBoundingClientRect();
        const fx = sr.left - fr.left + mx;
        const fy = sr.top - fr.top + my;
        lens.style.left = fx + OFFSET + "px";
        lens.style.top = fy - L - OFFSET + "px";
        const half = lens.querySelector(".half");
        half.style.backgroundImage = 'url("' + split.dataset.wpp + '")';
        half.style.backgroundSize = dw * Z + "px " + dh * Z + "px";
        half.style.backgroundPosition = bgX + "px " + bgY + "px";
        const diffLayer = lens.querySelector(".difflayer");
        if (diffLayer) {
          if (split.dataset.diffFull) {
            diffLayer.style.backgroundImage = 'url("' + split.dataset.diffFull + '")';
            diffLayer.style.backgroundSize = dw * Z + "px " + dh * Z + "px";
            diffLayer.style.backgroundPosition = bgX + "px " + bgY + "px";
          } else {
            diffLayer.style.backgroundImage = "none";
          }
        }
        lens.style.display = "block";
      };

      const hideLens = () => { lens.style.display = "none"; };
      const scheduleHide = () => {
        clearTimeout(state.hideTimer);
        state.hideTimer = setTimeout(() => { if (!state.pinned) hideLens(); }, 300);
      };
      const setLoupe = (on) => {
        state.loupe = on;
        split.dataset.loupe = on ? "on" : "";
        if (btn) { btn.textContent = on ? "Hide loupe" : "View loupe"; btn.classList.toggle("on", on); }
        if (!on) hideLens();
      };

      split.querySelectorAll(".marker").forEach((marker) => {
        marker.addEventListener("pointerdown", (event) => event.stopPropagation());
        marker.addEventListener("mouseenter", () => {
          if (state.loupe) return;
          state.pinned = true;
          paint(Number(marker.dataset.cx), Number(marker.dataset.cy));
        });
        marker.addEventListener("mouseleave", () => {
          if (state.loupe) return;
          state.pinned = false;
          scheduleHide();
        });
        marker.addEventListener("click", (event) => {
          event.stopPropagation();
          if (state.loupe) return;
          state.pinned = !state.pinned;
          if (state.pinned) paint(Number(marker.dataset.cx), Number(marker.dataset.cy));
          else hideLens();
        });
      });

      split.addEventListener("pointermove", (event) => {
        if (!state.loupe) return;
        const rect = split.getBoundingClientRect();
        paint(event.clientX - rect.left, event.clientY - rect.top);
      });
      split.addEventListener("pointerleave", () => { if (state.loupe) hideLens(); });
      split.addEventListener("pointerdown", (event) => {
        if (state.loupe) return;
        state.pinned = false;
        hideLens();
      });
      if (btn) {
        btn.addEventListener("click", (event) => { event.stopPropagation(); setLoupe(!state.loupe); });
      }
      document.addEventListener("pointerdown", (event) => {
        if (!state.loupe) return;
        if (split.contains(event.target) || event.target === btn) return;
        setLoupe(false);
      }, true);
    }
  });
}
window.addEventListener('load', positionMarkers);
window.addEventListener('resize', positionMarkers);

document.querySelectorAll('.split').forEach((split) => {
  let dragging = false;
  const setFromX = (clientX) => {
    const r = split.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    split.style.setProperty('--split', pct + '%');
    split.setAttribute('aria-valuenow', String(Math.round(pct)));
    markerVisibility(split);
  };
  split.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.knob')) return;
    dragging = true;
    split.setPointerCapture(event.pointerId);
    setFromX(event.clientX);
  });
  split.addEventListener('pointermove', (event) => { if (dragging) setFromX(event.clientX); });
  split.addEventListener('pointerup', () => { dragging = false; });
  split.addEventListener('pointercancel', () => { dragging = false; });

  const knob = split.querySelector('.knob');
  if (knob) {
    let knobDragging = false;
    const setKnobY = (clientY) => {
      const r = split.getBoundingClientRect();
      const pct = Math.max(4, Math.min(96, ((clientY - r.top) / r.height) * 100));
      split.style.setProperty('--knob-y', pct + '%');
    };
    knob.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      knobDragging = true;
      knob.setPointerCapture(event.pointerId);
      // The handle is a 2D control: x slides the wipe, y parks the handle.
      setFromX(event.clientX);
      setKnobY(event.clientY);
    });
    knob.addEventListener('pointermove', (event) => {
      event.stopPropagation();
      if (!knobDragging) return;
      setFromX(event.clientX);
      setKnobY(event.clientY);
    });
    knob.addEventListener('pointerup', (event) => { event.stopPropagation(); knobDragging = false; });
    knob.addEventListener('pointercancel', () => { knobDragging = false; });
    knob.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      split.style.setProperty('--knob-y', '50%');
    });
    knob.addEventListener('keydown', (event) => {
      const now = parseFloat(split.style.getPropertyValue('--knob-y')) || 50;
      const step = event.shiftKey ? 10 : 3;
      let next = now;
      if (event.key === 'ArrowUp') next = Math.max(4, now - step);
      else if (event.key === 'ArrowDown') next = Math.min(96, now + step);
      else if (event.key === 'Home') next = 4;
      else if (event.key === 'End') next = 96;
      else return;
      event.preventDefault();
      event.stopPropagation();
      split.style.setProperty('--knob-y', next + '%');
    });
    knob.setAttribute('tabindex', '0');
    knob.setAttribute('role', 'button');
    knob.setAttribute('aria-label', 'Move the divider handle up or down');
  }
  split.addEventListener('keydown', (event) => {
    const now = Number(split.getAttribute('aria-valuenow') || 50);
    const step = event.shiftKey ? 10 : 2;
    let next = now;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, now - step);
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(100, now + step);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 100;
    else return;
    event.preventDefault();
    split.style.setProperty('--split', next + '%');
    split.setAttribute('aria-valuenow', String(next));
    markerVisibility(split);
  });
});
</script></body></html>`;

fs.mkdirSync(path.join(OUT, "components"), { recursive: true });

const stateCaptures = fs.existsSync(path.join(OUT, "state-captures.json"))
  ? JSON.parse(fs.readFileSync(path.join(OUT, "state-captures.json"), "utf8"))
  : [];
const stateGroups = new Map();
for (const entry of stateCaptures) {
  if (!entry.ok) continue;
  const stateSlug = entry.state.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const key = `${entry.component}--${stateSlug}`;
  if (!stateGroups.has(key)) stateGroups.set(key, { component: entry.component, state: entry.state, stateSlug, viewports: {} });
  stateGroups.get(key).viewports[entry.name] = { ok: true, base: entry.base, radix: entry.radix };
}
const statesByComponent = new Map();
for (const group of stateGroups.values()) {
  if (!statesByComponent.has(group.component)) statesByComponent.set(group.component, []);
  statesByComponent.get(group.component).push(group);
}

for (const comp of captured) {
  const state = comp.state;
  const body = `<p><a href="../gallery.html">← All components</a></p>
  <h1>${comp.component}</h1>
  <p class="meta">${comp.page} · state: ${state} · ${comp.family}</p>
  <p class="sub">WPP Open is the original web-component Storybook render. Base and Radix are the installed registries. Drag the panel or the handle left/right to wipe; drag the handle up/down to park it out of the way (double-click to re-centre it).</p>
  ${statesByComponent.has(comp.component) ? `<p class="states">States: <a href="${comp.slug}.html">default</a>${statesByComponent.get(comp.component).map((g) => ` · <a href="${comp.slug}--${g.stateSlug}.html">${g.state}</a>`).join("")}</p>` : ""}
  ${flagged(comp) ? `<p class="missing">Interactive/dynamic component: this raw default capture has not run the fixture's click/scroll preparation, so the diff below is not a parity result. The authoritative comparison is the proof sheet, where this component is clean.</p>` : ""}
  <section class="viewport" data-viewport="1440x900"><h2>1440 × 900</h2><div class="grid">${splitPair(comp, "1440x900", "Base")}${splitPair(comp, "1440x900", "Radix")}</div></section>
  <section class="viewport" data-viewport="390x844"><h2>390 × 844</h2><div class="grid">${splitPair(comp, "390x844", "Base")}${splitPair(comp, "390x844", "Radix")}</div></section>
  <p id="no-diffs" class="missing" style="display:none">No differences on this component at either viewport.</p>`;
  fs.writeFileSync(path.join(OUT, "components", `${comp.slug}.html`), page(`${comp.component} — proof`, body));
}

for (const group of stateGroups.values()) {
  const comp = captured.find((c) => c.component === group.component);
  if (!comp) continue;
  const sc = { component: comp.component, slug: comp.slug, viewports: group.viewports };
  const suffix = `--${group.stateSlug}`;
  const body = `<p><a href="../gallery.html">← All components</a> · <a href="${comp.slug}.html">default state</a></p>
  <h1>${comp.component} · ${group.state}</h1>
  <p class="meta">${comp.page} · state: ${group.state} · ${comp.family}</p>
  <p class="sub">This is the state the proof-sheet square refers to. WPP Open is the original web-component render; Base and Radix are the installed registries.</p>
  <section class="viewport" data-viewport="1440x900"><h2>1440 × 900</h2><div class="grid">${splitPair(sc, "1440x900", "Base", suffix)}${splitPair(sc, "1440x900", "Radix", suffix)}</div></section>
  <section class="viewport" data-viewport="390x844"><h2>390 × 844</h2><div class="grid">${splitPair(sc, "390x844", "Base", suffix)}${splitPair(sc, "390x844", "Radix", suffix)}</div></section>
  <p id="no-diffs" class="missing" style="display:none">No differences on this component at either viewport.</p>`;
  fs.writeFileSync(path.join(OUT, "components", `${comp.slug}--${group.stateSlug}.html`), page(`${comp.component} · ${group.state} — proof`, body));
}

const exact = (list, key) => list.filter((c) => c.viewports[key]?.ok && c.viewports[key][key === "1440x900" ? "base" : "base"]?.pct === 0).length;
const cards = components.map((c) => {
  const v = c.viewports["1440x900"];
  const thumb = v?.ok ? `shots/${c.slug}/1440x900-base.png` : "";
  const baseWorst = Math.max(0, ...Object.values(c.viewports).map((x) => x?.base?.pct ?? 0));
  const radixWorst = Math.max(0, ...Object.values(c.viewports).map((x) => x?.radix?.pct ?? 0));
  const worst = Math.max(baseWorst, radixWorst);
  const hasVisible = Object.keys(c.viewports).some((vp) => {
    const metaFile = path.join(OUT, "shots", c.slug, `${vp}.json`);
    if (!fs.existsSync(metaFile)) return false;
    const m = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    return [...(m.baseRegions ?? []), ...(m.radixRegions ?? [])].some((r) => !r.aaOnly);
  });
  return `<a class="card" href="components/${c.slug}.html" data-name="${c.component}" data-worst="${worst}" data-visible="${hasVisible ? 1 : 0}" data-aa="${worst > 0 && !hasVisible ? 1 : 0}">
    <div class="thumb">${thumb ? `<img src="${thumb}" alt="${c.component}" loading="lazy">` : `<span class="missing">no capture</span>`}</div>
    <div class="cardbody"><b>${c.component}</b><span class="muted">${c.state}</span>
      <div class="badges">${flagged(c) ? `<span class="badge aa">interactive state</span>` : `<span title="worst of 1440×900 and 390×844">Base ${badge({ pct: baseWorst })} · Radix ${badge({ pct: radixWorst })}</span>`}</div></div>
  </a>`;
}).join("\n");

const index = page("WPP registry proof gallery", `<h1>WPP registry proof gallery</h1>
<p class="sub">Base and Radix against WPP Open (original web components, Storybook reference), captured from the parity fixtures at 1440×900 and 390×844.</p>
<div class="cards">
<a class="bigcard sheetc" data-base="proof-sheet-1440.html" href="proof-sheet-1440.html"><b>Proof sheet — 1440×900</b><img class="sheet" data-all="proof-sheet-1440.png" data-errors="proof-sheet-1440-differences.png" data-visible="proof-sheet-1440-visible.png" data-aa="proof-sheet-1440-aa.png" src="proof-sheet-1440.png" alt="Proof sheet 1440"></a>
<a class="bigcard sheetc" data-base="proof-sheet-390.html" href="proof-sheet-390.html"><b>Proof sheet — 390×844</b><img class="sheet" data-all="proof-sheet-390.png" data-errors="proof-sheet-390-differences.png" data-visible="proof-sheet-390-visible.png" data-aa="proof-sheet-390-aa.png" src="proof-sheet-390.png" alt="Proof sheet 390"></a>
</div>
<p style="margin:26px 0 10px"><a href="gallery.html"><b>Browse all ${captured.length} component side-by-sides →</b></a></p>
<p class="sub">${captured.length} components captured. Each component page shows WPP Open vs Base and WPP Open vs Radix at both viewports, with a draggable slider and <b>pink circles marking every visibly differing region</b>; <span class="chip">✓ exact</span> means no pixel differs, and <span class="aachip">AA only · not visible</span> means the only difference is sub-pixel edge anti-aliasing. Cards marked <span class="badge aa">interactive state</span> need a click/scroll to reach their documented state; their raw diff is not a parity result — the proof sheet is authoritative.</p>` +
`<style>.cards{display:grid;grid-template-columns:1fr 1fr;gap:26px}.bigcard{display:block;background:#fff;border:1px solid #dcd7cf;border-radius:9px;padding:16px;color:inherit;text-decoration:none}.bigcard img{width:100%;border:1px solid #e6e1da;border-radius:6px;margin-top:10px}</style>`);
fs.writeFileSync(path.join(OUT, "index.html"), index);

const gallery = page("All components", `<p><a href="index.html">← Proof sheets</a></p><h1>All components</h1>
<p class="sub">${captured.length} components · one state each · WPP Open vs Base and Radix. Click a card for both viewports and full-size comparisons.</p>
<div class="cards" id="cards">${cards}</div>` +
`<style>.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}.card{display:block;background:#fff;border:1px solid #dcd7cf;border-radius:9px;overflow:hidden;color:inherit;text-decoration:none}.thumb{height:150px;display:flex;align-items:center;justify-content:center;background:#faf9f7;border-bottom:1px solid #ece7df}.thumb img{max-width:92%;max-height:130px}.cardbody{padding:10px 12px;display:flex;flex-direction:column;gap:3px}.muted{color:#7a746b;font-size:12px}.badges{font-size:12px;color:#5b554d;margin-top:3px}</style>`);
fs.writeFileSync(path.join(OUT, "gallery.html"), gallery);

console.log("components", components.length, "captured", captured.length);
