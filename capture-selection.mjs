import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/playwright/index.mjs";
import pixelmatch from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pixelmatch/index.js";
import { PNG } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pngjs/lib/png.js";

const OUT = "/Users/jamie.mills/c9h/code/shad-wpp-proof/gallery";
const slugify = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const comps = ["checkbox","checkbox-group","radio","radio-group","slider","toggle"];
const vps = [{name:"1440x900",width:1440,height:900},{name:"390x844",width:390,height:844}];
const pct=(a,b)=>{const pa=PNG.sync.read(a),pb=PNG.sync.read(b);if(pa.width!==pb.width||pa.height!==pb.height)return{pct:null,n:null,mismatch:true};const d=new PNG({width:pa.width,height:pa.height});const n=pixelmatch(pa.data,pb.data,d.data,pa.width,pa.height,{threshold:0,includeAA:true,alpha:1});return{pct:(n/(pa.width*pa.height))*100,n,width:pa.width,height:pa.height}};

const browser = await chromium.launch();
const out = [];
for (const component of comps) {
  for (const vp of vps) {
    const dir = path.join(OUT, "shots", slugify(component));
    fs.mkdirSync(dir, { recursive: true });
    const wpp = path.join(dir, `${vp.name}-wpp.png`);
    const base = path.join(dir, `${vp.name}-base.png`);
    const radix = path.join(dir, `${vp.name}-radix.png`);
    const q = `component=${component}&state=default&mode=`;
    try {
      let p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await p.goto(`http://127.0.0.1:5181/selection.html?${q}both`, { waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(() => window.__PARITY_READY__ === true, { timeout: 60000 });
      await p.waitForTimeout(400);
      await p.locator('[data-testid="reference"]').first().screenshot({ path: wpp, animations: "disabled" });
      await p.locator('[data-testid="rebuild"]').first().screenshot({ path: base, animations: "disabled" });
      await p.close();

      p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await p.goto(`http://127.0.0.1:5182/selection.html?${q}rebuild`, { waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(() => window.__PARITY_READY__ === true, { timeout: 60000 });
      await p.waitForTimeout(400);
      await p.locator('[data-testid="rebuild"]').first().screenshot({ path: radix, animations: "disabled" });
      await p.close();

      const bd = pct(fs.readFileSync(wpp), fs.readFileSync(base));
      const rd = pct(fs.readFileSync(wpp), fs.readFileSync(radix));
      fs.writeFileSync(path.join(dir, `${vp.name}.json`), JSON.stringify({ component, family: "selection", page: "/selection.html", state: "default", viewport: vp.name, base: bd, radix: rd }, null, 2));
      out.push({ component, family: "selection", page: "/selection.html", state: "default", name: vp.name, ok: true, base: bd, radix: rd });
      console.log("OK", component, vp.name);
    } catch (error) {
      out.push({ component, family: "selection", page: "/selection.html", state: "default", name: vp.name, ok: false, error: String(error?.message ?? error).slice(0, 200) });
      console.log("FAIL", component, vp.name, String(error?.message ?? error).slice(0, 120));
    }
  }
}
await browser.close();
const resultsFile = path.join(OUT, "capture-results.json");
const existing = JSON.parse(fs.readFileSync(resultsFile, "utf8")).filter((r) => !comps.includes(r.component));
fs.writeFileSync(resultsFile, JSON.stringify([...existing, ...out], null, 2) + "\n");
console.log("done", out.filter((o) => o.ok).length, "/", out.length);
