import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/playwright/index.mjs";
import pixelmatch from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pixelmatch/index.js";
import { PNG } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pngjs/lib/png.js";

const OUT = "/Users/jamie.mills/c9h/code/shad-wpp-proof/gallery";
const BASE = "http://127.0.0.1:5181";
const RADIX = "http://127.0.0.1:5182";
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "390x844", width: 390, height: 844 },
];
const planAll = JSON.parse(fs.readFileSync("/tmp/gallery-plan.json", "utf8"));
const SKIP = new Set(["modal","full-screen-modal","side-modal","toast-container","swiper"]);
const SKIP_PREFIX = ["ag-grid"];
const plan = planAll.filter((c) => !SKIP.has(c.component) && !SKIP_PREFIX.some((p) => c.component.startsWith(p)));

const slugify = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const pct = (a, b) => {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return { pct: null, n: null, mismatch: true };
  const diff = new PNG({ width: pa.width, height: pa.height });
  const n = pixelmatch(pa.data, pb.data, diff.data, pa.width, pa.height, { threshold: 0, includeAA: true, alpha: 1 });
  return { pct: (n / (pa.width * pa.height)) * 100, n, width: pa.width, height: pa.height };
};

async function ready(page) {
  await page.waitForFunction(() => window.__PARITY_READY__ === true, { timeout: 90000 });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForTimeout(350);
}

async function shoot(page, selector, file) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 25000 });
  await el.screenshot({ path: file, animations: "disabled", caret: "hide" });
}

async function captureOne(browser, c, viewport) {
  const dir = path.join(OUT, "shots", slugify(c.component));
  fs.mkdirSync(dir, { recursive: true });
  const wpp = path.join(dir, `${viewport.name}-wpp.png`);
  const base = path.join(dir, `${viewport.name}-base.png`);
  const radix = path.join(dir, `${viewport.name}-radix.png`);
  if (fs.existsSync(wpp) && fs.existsSync(base) && fs.existsSync(radix)) {
    return { ok: true, cached: true };
  }

  const query = `component=${encodeURIComponent(c.component)}&state=${encodeURIComponent(c.state)}`;

  const bp = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    await bp.goto(`${BASE}${c.page}?${query}&mode=both`, { waitUntil: "load", timeout: 45000 });
    await ready(bp);
    await shoot(bp, '[data-testid="reference"]', wpp);
    await shoot(bp, '[data-testid="rebuild"]', base);
  } finally {
    await bp.close().catch(() => {});
  }

  let rp = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  try {
    await rp.goto(`${RADIX}${c.page}?${query}&mode=rebuild`, { waitUntil: "load", timeout: 45000 });
    await ready(rp);
    await shoot(rp, '[data-testid="rebuild"]', radix);
  } catch (error) {
    await rp.close().catch(() => {});
    rp = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await rp.goto(`${RADIX}${c.page}?${query}&mode=both`, { waitUntil: "load", timeout: 45000 });
      await ready(rp);
      await shoot(rp, '[data-testid="rebuild"]', radix);
    } finally {
      await rp.close().catch(() => {});
    }
  }

  const bd = pct(fs.readFileSync(wpp), fs.readFileSync(base));
  const rd = pct(fs.readFileSync(wpp), fs.readFileSync(radix));
  const metaFile = path.join(dir, `${viewport.name}.json`);
  fs.writeFileSync(metaFile, `${JSON.stringify({ component: c.component, family: c.family, page: c.page, state: c.state, viewport: viewport.name, base: bd, radix: rd }, null, 2)}\n`);
  return { ok: true, base: bd, radix: rd };
}

const results = [];
let index = 0;
const browser = await chromium.launch();
async function worker(id) {
  while (true) {
    const i = index++;
    if (i >= plan.length) return;
    const c = plan[i];
    for (const viewport of VIEWPORTS) {
      let lastError = null;
      let ok = false;
      for (let attempt = 1; attempt <= 2 && !ok; attempt += 1) {
        try {
          const r = await captureOne(browser, c, viewport);
          ok = true;
          results.push({ ...c, ...viewport, ok: true, attempt, ...r });
        } catch (error) {
          lastError = String(error?.message ?? error).slice(0, 300);
        }
      }
      if (!ok) {
        results.push({ ...c, ...viewport, ok: false, error: lastError });
        console.log(`FAIL ${c.component} ${viewport.name} ${lastError}`);
      }
    }
    if ((i + 1) % 5 === 0 || i === plan.length - 1) {
      console.log(`progress ${i + 1}/${plan.length} ${c.component}`);
    }
  }
}
await Promise.all([0].map((id) => worker(id)));
await browser.close();
fs.writeFileSync(path.join(OUT, "capture-results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
console.log(`done: ${results.length - failed.length}/${results.length} captures, ${failed.length} failed`);
if (failed.length) for (const f of failed.slice(0, 20)) console.log(" -", f.component, f.viewport, f.error);
