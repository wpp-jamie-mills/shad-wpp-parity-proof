import fs from "node:fs";
import path from "node:path";
import { PNG } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pngjs/lib/png.js";

const OUT = "/Users/jamie.mills/c9h/code/shad-wpp-proof/gallery";

function write(wppFile, regFile, outFile) {
  const a = PNG.sync.read(fs.readFileSync(wppFile));
  const b = PNG.sync.read(fs.readFileSync(regFile));
  if (a.width !== b.width || a.height !== b.height) return false;
  const out = new PNG({ width: a.width, height: a.height });
  let any = false;
  for (let i = 0; i < a.data.length; i += 4) {
    const delta = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
      Math.abs(a.data[i + 3] - b.data[i + 3]),
    );
    if (delta === 0) { out.data[i + 3] = 0; continue; }
    any = true;
    out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 170;
    out.data[i + 3] = delta > 5 ? 255 : 150;
  }
  if (!any) return false;
  fs.writeFileSync(outFile, PNG.sync.write(out));
  return true;
}

let made = 0;
for (const dirName of fs.readdirSync(path.join(OUT, "shots"))) {
  const dir = path.join(OUT, "shots", dirName);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const prefix = file.replace(/\.json$/, "");
    const base = path.join(dir, prefix);
    for (const [reg, out] of [["base", `${base}-diff-full.png`], ["radix", `${base}-radix-diff-full.png`]]) {
      if (fs.existsSync(`${base}-${reg}.png`) && write(`${base}-wpp.png`, `${base}-${reg}.png`, out)) made += 1;
    }
  }
}
console.log("full diff images", made);
