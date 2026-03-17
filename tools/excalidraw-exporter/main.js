#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { register } from "node:module";
import { performance as nodePerformance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, CanvasRenderingContext2D } from "canvas";
import { JSDOM } from "jsdom";
import { applyPath2DToCanvasRenderingContext, Path2D } from "path2d";

register("./json-loader.js", import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const defaultFontOutputDir = path.join(repoRoot, "static", "fonts", "excalidraw");
const defaultFontUrlPrefix = "/fonts/excalidraw";
const packagedFontsDir = path.join(
  __dirname,
  "node_modules",
  "@excalidraw",
  "excalidraw",
  "dist",
  "prod",
  "fonts"
);
const svgNs = "http://www.w3.org/2000/svg";
const googleFontsRanges = {
  CYRILIC:
    "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116",
  CYRILIC_EXT:
    "U+0460-052F, U+1C80-1C88, U+20B4, U+2DE0-2DFF, U+A640-A69F, U+FE2E-FE2F",
  LATIN:
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  LATIN_EXT:
    "U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF",
  VIETNAMESE:
    "U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB",
};
const packagedFontFaces = {
  Cascadia: [{ file: "Cascadia/CascadiaCode-Regular.woff2" }],
  "Comic Shanns": [
    {
      file: "ComicShanns/ComicShanns-Regular-279a7b317d12eb88de06167bd672b4b4.woff2",
      unicodeRange:
        "U+20-7e,U+a1-a6,U+a8,U+ab-ac,U+af-b1,U+b4,U+b8,U+bb-bc,U+bf-cf,U+d1-d7,U+d9-de,U+e0-ef,U+f1-f7,U+f9-ff,U+131,U+152-153,U+2c6,U+2da,U+2dc,U+2013-2014,U+2018-201a,U+201c-201d,U+2020-2022,U+2026,U+2039-203a,U+2044,U+20ac,U+2191,U+2193,U+2212",
    },
    {
      file: "ComicShanns/ComicShanns-Regular-fcb0fc02dcbee4c9846b3e2508668039.woff2",
      unicodeRange:
        "U+100-10f,U+112-125,U+128-130,U+134-137,U+139-13c,U+141-148,U+14c-151,U+154-161,U+164-165,U+168-17f,U+1bf,U+1f7,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+a75b",
    },
    {
      file: "ComicShanns/ComicShanns-Regular-dc6a8806fa96795d7b3be5026f989a17.woff2",
      unicodeRange:
        "U+2c7,U+2d8-2d9,U+2db,U+2dd,U+315,U+2190,U+2192,U+2200,U+2203-2204,U+2264-2265,U+f6c3",
    },
    {
      file: "ComicShanns/ComicShanns-Regular-6e066e8de2ac57ea9283adb9c24d7f0c.woff2",
      unicodeRange: "U+3bb",
    },
  ],
  Excalifont: [
    {
      file: "Excalifont/Excalifont-Regular-a88b72a24fb54c9f94e3b5fdaa7481c9.woff2",
      unicodeRange:
        "U+20-7e,U+a0-a3,U+a5-a6,U+a8-ab,U+ad-b1,U+b4,U+b6-b8,U+ba-ff,U+131,U+152-153,U+2bc,U+2c6,U+2da,U+2dc,U+304,U+308,U+2013-2014,U+2018-201a,U+201c-201e,U+2020,U+2022,U+2024-2026,U+2030,U+2039-203a,U+20ac,U+2122,U+2212",
    },
    {
      file: "Excalifont/Excalifont-Regular-be310b9bcd4f1a43f571c46df7809174.woff2",
      unicodeRange:
        "U+100-130,U+132-137,U+139-149,U+14c-151,U+154-17e,U+192,U+1fc-1ff,U+218-21b,U+237,U+1e80-1e85,U+1ef2-1ef3,U+2113",
    },
    {
      file: "Excalifont/Excalifont-Regular-b9dcf9d2e50a1eaf42fc664b50a3fd0d.woff2",
      unicodeRange: "U+400-45f,U+490-491,U+2116",
    },
    {
      file: "Excalifont/Excalifont-Regular-41b173a47b57366892116a575a43e2b6.woff2",
      unicodeRange:
        "U+37e,U+384-38a,U+38c,U+38e-393,U+395-3a1,U+3a3-3a8,U+3aa-3cf,U+3d7",
    },
    {
      file: "Excalifont/Excalifont-Regular-3f2c5db56cc93c5a6873b1361d730c16.woff2",
      unicodeRange:
        "U+2c7,U+2d8-2d9,U+2db,U+2dd,U+302,U+306-307,U+30a-30c,U+326-328,U+212e,U+2211,U+fb01-fb02",
    },
    {
      file: "Excalifont/Excalifont-Regular-349fac6ca4700ffec595a7150a0d1e1d.woff2",
      unicodeRange:
        "U+462-463,U+472-475,U+4d8-4d9,U+4e2-4e3,U+4e6-4e9,U+4ee-4ef",
    },
    {
      file: "Excalifont/Excalifont-Regular-623ccf21b21ef6b3a0d87738f77eb071.woff2",
      unicodeRange: "U+300-301,U+303",
    },
  ],
  Helvetica: [{ file: "Liberation/LiberationSans-Regular.woff2" }],
  Nunito: [
    {
      file: "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTk3j6zbXWjgevT5.woff2",
      unicodeRange: googleFontsRanges.CYRILIC_EXT,
      weight: "500",
    },
    {
      file: "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTA3j6zbXWjgevT5.woff2",
      unicodeRange: googleFontsRanges.CYRILIC,
      weight: "500",
    },
    {
      file: "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTs3j6zbXWjgevT5.woff2",
      unicodeRange: googleFontsRanges.VIETNAMESE,
      weight: "500",
    },
    {
      file: "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTo3j6zbXWjgevT5.woff2",
      unicodeRange: googleFontsRanges.LATIN_EXT,
      weight: "500",
    },
    {
      file: "Nunito/Nunito-Regular-XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhdTQ3j6zbXWjgeg.woff2",
      unicodeRange: googleFontsRanges.LATIN,
      weight: "500",
    },
  ],
  Virgil: [{ file: "Virgil/Virgil-Regular.woff2" }],
};

let excalidrawModulePromise;
let globalsInstalled = false;

applyPath2DToCanvasRenderingContext(CanvasRenderingContext2D);

const installGlobal = (key, value) => {
  if (value === undefined) {
    return;
  }
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
};

const ensureGlobals = () => {
  if (globalsInstalled) {
    return;
  }

  const dom = new JSDOM("", { url: "https://dmytro.sh" });
  const { window } = dom;
  const FontFaceSet = class extends window.EventTarget {
    constructor() {
      super();
      this.faces = new Set();
      this.ready = Promise.resolve(this);
    }

    add(fontFace) {
      this.faces.add(fontFace);
      return this;
    }

    check() {
      return true;
    }

    clear() {
      this.faces.clear();
    }

    delete(fontFace) {
      return this.faces.delete(fontFace);
    }

    async load() {
      return [];
    }

    [Symbol.iterator]() {
      return this.faces.values();
    }
  };
  const FontFace = class {
    constructor(family, source, descriptors = {}) {
      this.family = family;
      this.source = source;
      this.status = "loaded";
      Object.assign(this, descriptors);
    }

    async load() {
      return this;
    }
  };

  window.CanvasRenderingContext2D = CanvasRenderingContext2D;
  window.FontFace = FontFace;
  window.Path2D = Path2D;
  window.requestAnimationFrame ??= (callback) =>
    setTimeout(() => callback(Date.now()), 0);
  window.cancelAnimationFrame ??= (handle) => clearTimeout(handle);
  window.matchMedia ??= () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  });
  window.ResizeObserver ??= class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.document.fonts ??= new FontFaceSet();

  installGlobal("window", window);
  installGlobal("self", window);
  installGlobal("top", window);
  installGlobal("document", window.document);
  installGlobal("navigator", window.navigator);
  installGlobal("FontFace", FontFace);
  installGlobal("Element", window.Element);
  installGlobal("HTMLElement", window.HTMLElement);
  installGlobal("SVGElement", window.SVGElement);
  installGlobal("Node", window.Node);
  installGlobal("DOMParser", window.DOMParser);
  installGlobal("XMLSerializer", window.XMLSerializer);
  installGlobal("HTMLCanvasElement", window.HTMLCanvasElement);
  installGlobal("HTMLImageElement", window.HTMLImageElement);
  installGlobal("Image", window.Image);
  installGlobal("ImageData", window.ImageData);
  installGlobal("Blob", window.Blob);
  installGlobal("File", window.File);
  installGlobal("FileReader", window.FileReader);
  installGlobal("Path2D", Path2D);
  installGlobal("CanvasRenderingContext2D", CanvasRenderingContext2D);
  installGlobal("atob", window.atob.bind(window));
  installGlobal("btoa", window.btoa.bind(window));
  installGlobal("performance", nodePerformance);
  installGlobal("devicePixelRatio", 1);
  installGlobal("createCanvas", createCanvas);

  globalsInstalled = true;
};

const loadExcalidraw = async () => {
  ensureGlobals();
  excalidrawModulePromise ??= import("@excalidraw/excalidraw");
  return excalidrawModulePromise;
};

const readExcalidrawFile = async (inputFile) =>
  JSON.parse(await fs.readFile(inputFile, "utf8"));

const ensureDir = async (directory) => {
  await fs.mkdir(directory, { recursive: true });
};

const remapLegacyFonts = (raw, fontFamilyMap) => {
  const mapFontFamily = (fontFamily) =>
    fontFamily == null ? fontFamily : fontFamilyMap.get(fontFamily) ?? fontFamily;

  return {
    ...raw,
    appState: raw.appState
      ? {
          ...raw.appState,
          currentItemFontFamily: mapFontFamily(raw.appState.currentItemFontFamily),
        }
      : raw.appState,
    elements: (raw.elements ?? []).map((element) =>
      element.type === "text"
        ? {
            ...element,
            fontFamily: mapFontFamily(element.fontFamily),
          }
        : element
    ),
  };
};

const syncPackagedFontAssets = async (fontFamilies, fontOutputDir) => {
  for (const family of fontFamilies) {
    for (const fontFace of packagedFontFaces[family] ?? []) {
      const sourceFile = path.join(packagedFontsDir, fontFace.file);
      const outputFile = path.join(fontOutputDir, fontFace.file);
      await ensureDir(path.dirname(outputFile));
      await fs.copyFile(sourceFile, outputFile);
    }
  }
};

const buildFontFaceCss = (fontFamilies, fontUrlPrefix) =>
  [...fontFamilies]
    .flatMap((family) =>
      (packagedFontFaces[family] ?? []).map(({ file, unicodeRange, weight }) =>
        [
          "@font-face {",
          `  font-family: "${family}";`,
          `  src: url('${fontUrlPrefix}/${file}') format('woff2');`,
          weight ? `  font-weight: ${weight};` : null,
          unicodeRange ? `  unicode-range: ${unicodeRange};` : null,
          "}",
        ]
          .filter(Boolean)
          .join("\n")
      )
    )
    .join("\n");

const materializeFontAssets = async ({ svg, css }) => {
  const dom = new JSDOM(svg, { contentType: "image/svg+xml" });
  const document = dom.window.document;
  const root = document.documentElement;

  let defs = root.querySelector("defs");
  let style = defs?.querySelector("style.style-fonts") ?? null;

  if (!style) {
    if (!css) {
      return svg;
    }

    defs ??= document.createElementNS(svgNs, "defs");
    style = document.createElementNS(svgNs, "style");
    style.setAttribute("class", "style-fonts");
    defs.prepend(style);
    if (!defs.parentNode) {
      root.insertBefore(defs, root.firstChild);
    }
  }

  style.textContent = css;

  return root.outerHTML;
};

const outputPathFor = (inputFile, darkMode) =>
  path.format({
    dir: path.dirname(inputFile),
    name: `${path.basename(inputFile, ".excalidraw")}-${darkMode ? "dark" : "light"}`,
    ext: ".svg",
  });

export const convert = async (
  inputFile,
  {
    darkMode = false,
    fontOutputDir = defaultFontOutputDir,
    fontUrlPrefix = defaultFontUrlPrefix,
  } = {}
) => {
  const { exportToSvg, restore, FONT_FAMILY } = await loadExcalidraw();
  const raw = await readExcalidrawFile(inputFile);
  const normalizedRaw = remapLegacyFonts(
    raw,
    new Map([
      [FONT_FAMILY.Virgil, FONT_FAMILY.Excalifont],
      [FONT_FAMILY.Helvetica, FONT_FAMILY.Nunito],
      [FONT_FAMILY.Cascadia, FONT_FAMILY["Comic Shanns"]],
    ])
  );
  const restored = restore(normalizedRaw, null, null, {
    refreshDimensions: true,
    repairBindings: true,
  });
  const fontFamilyNameById = new Map(
    Object.entries(FONT_FAMILY).map(([family, id]) => [id, family])
  );
  const usedFontFamilies = new Set(
    restored.elements
      .filter((element) => element.type === "text")
      .map((element) => fontFamilyNameById.get(element.fontFamily))
      .filter((family) => packagedFontFaces[family])
  );
  const appState = {
    ...restored.appState,
    exportBackground: false,
    exportScale: 2,
    exportWithDarkMode: darkMode,
  };
  await syncPackagedFontAssets(usedFontFamilies, fontOutputDir);
  const svgElement = await exportToSvg({
    elements: restored.elements,
    appState,
    files: restored.files ?? raw.files ?? {},
    exportPadding: appState.exportPadding ?? 10,
    renderEmbeddables: false,
    skipInliningFonts: true,
  });
  const outputFile = outputPathFor(inputFile, darkMode);
  const svg = await materializeFontAssets({
    svg: svgElement.outerHTML,
    css: buildFontFaceCss(usedFontFamilies, fontUrlPrefix),
  });

  await fs.writeFile(outputFile, svg, "utf8");
  return outputFile;
};

export const convertPair = async (inputFile, options = {}) => {
  await convert(inputFile, { ...options, darkMode: false });
  await convert(inputFile, { ...options, darkMode: true });
};

const main = async () => {
  const inputFiles = process.argv.slice(2);

  if (inputFiles.length === 0) {
    console.error("Usage: excalidraw-exporter <file.excalidraw> [...]");
    process.exitCode = 1;
    return;
  }

  for (const inputFile of inputFiles) {
    await convertPair(inputFile);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
