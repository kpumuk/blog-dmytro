#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
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
const svgNs = "http://www.w3.org/2000/svg";
const exportBackgroundColors = {
  light: "#fffef8",
  dark: "#1f222a",
};
const fontDataUrlPattern = /url\((['"]?)data:font\/woff2;base64,([^)'"]+)\1\)/g;

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

const externalizeFontAssets = async ({ style, fontOutputDir, fontUrlPrefix }) => {
  const fontAssetDir = path.join(fontOutputDir, "generated");
  await ensureDir(fontAssetDir);

  const fontFiles = new Map();
  style.textContent = style.textContent.replace(
    fontDataUrlPattern,
    (_, quote, base64) => {
      const fontData = Buffer.from(base64, "base64");
      const hash = createHash("sha256")
        .update(fontData)
        .digest("hex")
        .slice(0, 16);
      const fileName = `${hash}.woff2`;
      fontFiles.set(fileName, fontData);
      return `url(${quote}${fontUrlPrefix}/generated/${fileName}${quote})`;
    }
  );

  for (const [fileName, fontData] of fontFiles) {
    await fs.writeFile(path.join(fontAssetDir, fileName), fontData);
  }
};

const applyBackgroundColor = ({ root, backgroundColor }) => {
  if (!backgroundColor) {
    return;
  }
  const existingStyle = root.getAttribute("style");
  const nextStyle = [existingStyle, `background-color: ${backgroundColor}`]
    .filter(Boolean)
    .join("; ");
  root.setAttribute("style", nextStyle);
};

const prepareSvg = async ({ svg, fontOutputDir, fontUrlPrefix, backgroundColor }) => {
  const dom = new JSDOM(svg, { contentType: "image/svg+xml" });
  const document = dom.window.document;
  const root = document.documentElement;
  const style = root.querySelector("defs > style.style-fonts");

  if (style) {
    await externalizeFontAssets({ style, fontOutputDir, fontUrlPrefix });
  }

  const rootFilter = root.getAttribute("filter");
  if (rootFilter) {
    root.removeAttribute("filter");

    const sceneGroup = document.createElementNS(svgNs, "g");
    sceneGroup.setAttribute("filter", rootFilter);

    for (const node of [...root.childNodes]) {
      if (node.nodeType === document.COMMENT_NODE) {
        continue;
      }
      if (
        node.nodeType === document.ELEMENT_NODE &&
        ["defs", "metadata"].includes(node.tagName)
      ) {
        continue;
      }
      sceneGroup.appendChild(node);
    }

    if (sceneGroup.childNodes.length > 0) {
      root.appendChild(sceneGroup);
    }
  }

  applyBackgroundColor({ root, backgroundColor });

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
  const appState = {
    ...restored.appState,
    exportBackground: false,
    exportScale: 2,
    exportWithDarkMode: darkMode,
  };
  const svgElement = await exportToSvg({
    elements: restored.elements,
    appState,
    files: restored.files ?? raw.files ?? {},
    exportPadding: appState.exportPadding ?? 10,
    renderEmbeddables: false,
  });
  const outputFile = outputPathFor(inputFile, darkMode);
  const svg = await prepareSvg({
    svg: svgElement.outerHTML,
    fontOutputDir,
    fontUrlPrefix,
    backgroundColor: darkMode
      ? exportBackgroundColors.dark
      : exportBackgroundColors.light,
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
