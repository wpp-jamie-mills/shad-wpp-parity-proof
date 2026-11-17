import fs from "node:fs";
import path from "node:path";
import { chromium } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/playwright/index.mjs";
import pixelmatch from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pixelmatch/index.js";
import { PNG } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pngjs/lib/png.js";

const OUT = "/Users/jamie.mills/c9h/code/shad-wpp-proof/gallery";
const states = [
  "inverted-secondary-m","inverted-secondary-disabled-m","inverted-secondary-hover-m",
  "secondary-hover-m","destructive-secondary-hover-m","secondary-active-m",
  "destructive-secondary-active-m","secondary-focus-m","destructive-secondary-focus-m",
];
const vps = [{name:"1440x900",width:1440,height:900},{name:"390x844",width:390,height:844}];
const slug = (s) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
const pct=(a,b)=>{const pa=PNG.sync.read(a),pb=PNG.sync.read(b);if(pa.width!==pb.width||pa.height!==pb.height)return{pct:null,n:null,mismatch:true};const d=new PNG({width:pa.width,height:pa.height});const n=pixelmatch(pa.data,pb.data,d.data,pa.width,pa.height,{threshold:0,includeAA:true,alpha:1});return{pct:(n/(pa.width*pa.height))*100,n,width:pa.width,height:pa.height}};

const browser = await chromium.launch();
const out = [];
for (const state of states) {
  const s = slug(state);
  for (const vp of vps) {
    const dir = path.join(OUT, "shots", "button");
    const prefix = path.join(dir, `${vp.name}--${s}`);
    try {
      let p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await p.goto(`http://127.0.0.1:5181/parity.html?component=button&state=${encodeURIComponent(state)}&mode=both`, { waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(() => window.__PARITY_READY__ === true, { timeout: 60000 });
      await p.waitForTimeout(400);
      await p.locator('[data-testid="reference"]').first().screenshot({ path: `${prefix}-wpp.png`, animations: "disabled" });
      await p.locator('[data-testid="rebuild"]').first().screenshot({ path: `${prefix}-base.png`, animations: "disabled" });
      await p.close();

      p = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await p.goto(`http://127.0.0.1:5182/parity.html?component=button&state=${encodeURIComponent(state)}&mode=rebuild`, { waitUntil: "load", timeout: 60000 });
      await p.waitForFunction(() => window.__PARITY_READY__ === true, { timeout: 60000 });
      await p.waitForTimeout(400);
      await p.locator('[data-testid="rebuild"]').first().screenshot({ path: `${prefix}-radix.png`, animations: "disabled" });
      await p.close();

      const bd = pct(fs.readFileSync(`${prefix}-wpp.png`), fs.readFileSync(`${prefix}-base.png`));
      const rd = pct(fs.readFileSync(`${prefix}-wpp.png`), fs.readFileSync(`${prefix}-radix.png`));
      const meta = { component: "button", family: "buttons", page: "/parity.html", state, viewport: vp.name, base: bd, radix: rd };
      fs.writeFileSync(`${prefix}.json`, JSON.stringify(meta, null, 2) + "\n");
      out.push({ component: "button", family: "buttons", page: "/parity.html", state, name: vp.name, ok: true, base: bd, radix: rd });
      console.log("OK", state, vp.name);
    } catch (error) {
      out.push({ component: "button", family: "buttons", page: "/parity.html", state, name: vp.name, ok: false, error: String(error?.message ?? error).slice(0, 160) });
      console.log("FAIL", state, vp.name, String(error?.message ?? error).slice(0, 120));
    }
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, "state-captures.json"), JSON.stringify(out, null, 2) + "\n");
console.log("done", out.filter((o) => o.ok).length, "/", out.length);
