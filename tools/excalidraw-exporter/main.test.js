import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { convert } from "./main.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const sampleInput = path.join(
  repoRoot,
  "content",
  "posts",
  "20240827165643-on-dangers-of-open3-popen3",
  "open3-deadlock.excalidraw"
);

test("convert rewrites embedded fonts to local font assets", async () => {
  const tempRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "excalidraw-exporter-")
  );
  const tempInput = path.join(tempRoot, "open3-deadlock.excalidraw");
  const tempFontDir = path.join(tempRoot, "fonts");

  await fs.copyFile(sampleInput, tempInput);
  await convert(tempInput, { darkMode: false, fontOutputDir: tempFontDir });

  const svg = await fs.readFile(
    path.join(tempRoot, "open3-deadlock-light.svg"),
    "utf8"
  );
  const linkedFonts = [
    ...svg.matchAll(/\/fonts\/excalidraw\/([^'")\s]+\.woff2)/g),
  ].map((match) => match[1]);

  assert.ok(linkedFonts.length > 0);
  assert.doesNotMatch(svg, /data:font\/woff2/);
  assert.doesNotMatch(svg, /https:\/\/.*woff2/);
  assert.match(svg, /font-family="Excalifont,/);
  assert.match(svg, /font-family="Nunito,/);
  assert.match(svg, /font-family="Comic Shanns,/);
  assert.doesNotMatch(svg, /font-family="Virgil,/);
  assert.doesNotMatch(svg, /font-family="Helvetica,/);
  assert.doesNotMatch(svg, /font-family="Cascadia,/);

  for (const fontFile of linkedFonts) {
    await fs.access(path.join(tempFontDir, fontFile));
  }
});
