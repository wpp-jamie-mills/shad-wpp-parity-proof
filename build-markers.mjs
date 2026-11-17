import fs from "node:fs";
import path from "node:path";
import pixelmatch from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pixelmatch/index.js";
import { PNG } from "/Users/jamie.mills/c9h/code/shad-wpp/node_modules/pngjs/lib/png.js";

const OUT = "/Users/jamie.mills/c9h/code/shad-wpp-proof/gallery";
const CELL = 16;

function cropScaleAlpha(source, sx, sy, sw, sh, scale) {
  const out = new PNG({ width: sw * scale, height: sh * scale });
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const si = ((sy + Math.floor(y / scale)) * source.width + (sx + Math.floor(x / scale))) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = source.data[si];
      out.data[di + 1] = source.data[si + 1];
      out.data[di + 2] = source.data[si + 2];
      out.data[di + 3] = source.data[si + 3];
    }
  }
  return out;
}

function cropScale(source, sx, sy, sw, sh, scale) {
  const out = new PNG({ width: sw * scale, height: sh * scale });
  for (let y = 0; y < out.height; y += 1) {
    for (let x = 0; x < out.width; x += 1) {
      const si = ((sy + Math.floor(y / scale)) * source.width + (sx + Math.floor(x / scale))) * 4;
      const di = (y * out.width + x) * 4;
      out.data[di] = source.data[si];
      out.data[di + 1] = source.data[si + 1];
      out.data[di + 2] = source.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function writeZoom(wppFile, regFile, regions, outWpp, outReg, outDiff) {
  if (!regions.length) return null;
  const a = PNG.sync.read(fs.readFileSync(wppFile));
  const b = PNG.sync.read(fs.readFileSync(regFile));
  let minX = Math.min(...regions.map((r) => r.x));
  let minY = Math.min(...regions.map((r) => r.y));
  let maxX = Math.max(...regions.map((r) => r.x + r.w));
  let maxY = Math.max(...regions.map((r) => r.y + r.h));
  let sx = Math.max(0, Math.floor(minX * a.width) - 24);
  let sy = Math.max(0, Math.floor(minY * a.height) - 24);
  let ex = Math.min(a.width, Math.ceil(maxX * a.width) + 24);
  let ey = Math.min(a.height, Math.ceil(maxY * a.height) + 24);
  if (ex - sx < 48) { sx = Math.max(0, sx - 12); ex = Math.min(a.width, ex + 12); }
  if (ey - sy < 48) { sy = Math.max(0, sy - 12); ey = Math.min(a.height, ey + 12); }
  const sw = ex - sx;
  const sh = ey - sy;
  const scale = Math.max(2, Math.min(6, Math.floor(1200 / Math.max(sw, sh))));
  fs.writeFileSync(outWpp, PNG.sync.write(cropScale(a, sx, sy, sw, sh, scale)));
  fs.writeFileSync(outReg, PNG.sync.write(cropScale(b, sx, sy, sw, sh, scale)));
  if (outDiff) {
    const dm = new PNG({ width: sw, height: sh });
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const si = ((sy + y) * a.width + (sx + x)) * 4;
        const di = (y * sw + x) * 4;
        const delta = Math.max(
          Math.abs(a.data[si] - b.data[si]),
          Math.abs(a.data[si + 1] - b.data[si + 1]),
          Math.abs(a.data[si + 2] - b.data[si + 2]),
          Math.abs(a.data[si + 3] - b.data[si + 3]),
        );
        if (delta === 0) {
          dm.data[di + 3] = 0;
        } else {
          dm.data[di] = 255;
          dm.data[di + 1] = 0;
          dm.data[di + 2] = 170;
          dm.data[di + 3] = delta > 5 ? 255 : 150;
        }
      }
    }
    fs.writeFileSync(outDiff, PNG.sync.write(cropScaleAlpha(dm, 0, 0, sw, sh, scale)));
  }
  return { sx, sy, sw, sh, scale, px: regions.reduce((n, r) => n + r.px, 0) };
}

function writeFullDiff(wppFile, regFile, outFile) {
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
    if (delta === 0) {
      out.data[i + 3] = 0;
      continue;
    }
    any = true;
    out.data[i] = 255;
    out.data[i + 1] = 0;
    out.data[i + 2] = 170;
    out.data[i + 3] = delta > 5 ? 255 : 150;
  }
  if (any) {
    fs.writeFileSync(outFile, PNG.sync.write(out));
    return true;
  }
  return false;
}

function contentBox(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  let minX = png.width, minY = png.height, maxX = -1, maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      const a = png.data[i + 3];
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      const nearWhite = r > 246 && g > 246 && b > 246;
      if (a > 16 && !nearWhite) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0.5, y: 0.5, w: 0, h: 0 };
  return {
    x: minX / png.width,
    y: minY / png.height,
    w: (maxX - minX + 1) / png.width,
    h: (maxY - minY + 1) / png.height,
  };
}

function regionsFor(wppFile, regFile) {
  const a = PNG.sync.read(fs.readFileSync(wppFile));
  const b = PNG.sync.read(fs.readFileSync(regFile));
  if (a.width !== b.width || a.height !== b.height) {
    return { regions: [], aaPixels: 0, materialPixels: 0 };
  }
  const cells = new Map();
  let aaPixels = 0;
  let materialPixels = 0;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = (y * a.width + x) * 4;
      const delta = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
        Math.abs(a.data[i + 3] - b.data[i + 3]),
      );
      if (delta === 0) continue;
      const key = `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { aa: 0, material: 0 };
        cells.set(key, cell);
      }
      if (delta <= 5) {
        aaPixels += 1;
        cell.aa += 1;
      } else {
        materialPixels += 1;
        cell.material += 1;
      }
    }
  }
  const seen = new Set();
  const regions = [];
  for (const key of cells.keys()) {
    if (seen.has(key)) continue;
    const queue = [key];
    seen.add(key);
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, px = 0, materialPx = 0;
    while (queue.length) {
      const [gx, gy] = queue.pop().split(",").map(Number);
      const cell = cells.get(`${gx},${gy}`);
      minX = Math.min(minX, gx * CELL); minY = Math.min(minY, gy * CELL);
      maxX = Math.max(maxX, (gx + 1) * CELL); maxY = Math.max(maxY, (gy + 1) * CELL);
      px += cell.aa + cell.material;
      materialPx += cell.material;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const next = `${gx + dx},${gy + dy}`;
          if (cells.has(next) && !seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
    }
    regions.push({
      x: minX / a.width,
      y: minY / a.height,
      w: Math.min(a.width, maxX) / a.width - minX / a.width,
      h: Math.min(a.height, maxY) / a.height - minY / a.height,
      px,
      materialPx,
      aaOnly: materialPx === 0,
    });
  }
  regions.sort((l, r) => r.px - l.px);
  return { regions: regions.slice(0, 12), aaPixels, materialPixels };
}

const results = JSON.parse(fs.readFileSync(path.join(OUT, "capture-results.json"), "utf8"));
const byComp = new Map();
for (const r of results) {
  if (!r.ok) continue;
  const slug = r.component.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  const dir = path.join(OUT, "shots", slug);
  const metaFile = path.join(dir, `${r.name}.json`);
  if (!fs.existsSync(metaFile)) continue;
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  meta.content = contentBox(path.join(dir, `${r.name}-wpp.png`));
  const baseDiff = regionsFor(path.join(dir, `${r.name}-wpp.png`), path.join(dir, `${r.name}-base.png`));
  const radixDiff = regionsFor(path.join(dir, `${r.name}-wpp.png`), path.join(dir, `${r.name}-radix.png`));
  meta.baseRegions = baseDiff.regions;
  meta.baseAa = baseDiff.aaPixels;
  meta.baseMaterial = baseDiff.materialPixels;
  meta.radixRegions = radixDiff.regions;
  meta.radixAa = radixDiff.aaPixels;
  meta.radixMaterial = radixDiff.materialPixels;
  if ((meta.base?.n ?? 0) > 0) writeFullDiff(path.join(dir, `${r.name}-wpp.png`), path.join(dir, `${r.name}-base.png`), path.join(dir, `${r.name}-diff-full.png`));
  if ((meta.radix?.n ?? 0) > 0) writeFullDiff(path.join(dir, `${r.name}-wpp.png`), path.join(dir, `${r.name}-radix.png`), path.join(dir, `${r.name}-radix-diff-full.png`));
  meta.baseZoom = writeZoom(
    path.join(dir, `${r.name}-wpp.png`),
    path.join(dir, `${r.name}-base.png`),
    baseDiff.regions,
    path.join(dir, `${r.name}-base-zoom-wpp.png`),
    path.join(dir, `${r.name}-base-zoom-reg.png`),
    path.join(dir, `${r.name}-base-zoom-diff.png`),
  );
  meta.radixZoom = writeZoom(
    path.join(dir, `${r.name}-wpp.png`),
    path.join(dir, `${r.name}-radix.png`),
    radixDiff.regions,
    path.join(dir, `${r.name}-radix-zoom-wpp.png`),
    path.join(dir, `${r.name}-radix-zoom-reg.png`),
    path.join(dir, `${r.name}-radix-zoom-diff.png`),
  );
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
  if (!byComp.has(slug)) byComp.set(slug, { component: r.component, regions: 0 });
  byComp.get(slug).regions += meta.baseRegions.length + meta.radixRegions.length;
}
// State-specific captures (`<viewport>--<state>.json`) share the same pipeline.
for (const slugDir of fs.readdirSync(path.join(OUT, "shots"))) {
  const dir = path.join(OUT, "shots", slugDir);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f.includes("--"))) {
    const prefix = file.replace(/\.json$/, "");
    const metaFile = path.join(dir, file);
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    const wpp = path.join(dir, `${prefix}-wpp.png`);
    const baseFile = path.join(dir, `${prefix}-base.png`);
    const radixFile = path.join(dir, `${prefix}-radix.png`);
    if (!fs.existsSync(wpp) || !fs.existsSync(baseFile) || !fs.existsSync(radixFile)) continue;
    const baseDiff = regionsFor(wpp, baseFile);
    const radixDiff = regionsFor(wpp, radixFile);
    meta.content = contentBox(wpp);
    meta.baseRegions = baseDiff.regions;
    meta.baseAa = baseDiff.aaPixels;
    meta.baseMaterial = baseDiff.materialPixels;
    meta.radixRegions = radixDiff.regions;
    meta.radixAa = radixDiff.aaPixels;
    meta.radixMaterial = radixDiff.materialPixels;
    if ((meta.base?.n ?? 0) > 0) writeFullDiff(wpp, baseFile, `${prefix}-diff-full.png`);
    if ((meta.radix?.n ?? 0) > 0) writeFullDiff(wpp, radixFile, `${prefix}-radix-diff-full.png`);
    meta.baseZoom = writeZoom(wpp, baseFile, baseDiff.regions, `${prefix}-base-zoom-wpp.png`, `${prefix}-base-zoom-reg.png`, `${prefix}-base-zoom-diff.png`);
    meta.radixZoom = writeZoom(wpp, radixFile, radixDiff.regions, `${prefix}-radix-zoom-wpp.png`, `${prefix}-radix-zoom-reg.png`, `${prefix}-radix-zoom-diff.png`);
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2) + "\n");
  }
}

console.log("marked", [...byComp.values()].filter((c) => c.regions > 0).length, "components with differing regions");
for (const c of [...byComp.values()].filter((c) => c.regions > 0).slice(0, 20)) console.log(" -", c.component, c.regions);
