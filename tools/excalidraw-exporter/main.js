#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");

const { createCanvas, CanvasRenderingContext2D } = require("canvas");
const { applyPath2DToCanvasRenderingContext, Path2D } = require("path2d");

const JSDOM = require("jsdom").JSDOM;
const dom = new JSDOM("", { url: "https://dmytro.sh" });

applyPath2DToCanvasRenderingContext(CanvasRenderingContext2D);
dom.window.CanvasRenderingContext2D = CanvasRenderingContext2D;
dom.window.Path2D = Path2D;

const keys = [
  "document",
  "navigator",
  "window",
  "SVGElement",
  "Element",
  "Path2D",
];
Object.assign(
  globalThis,
  Object.fromEntries(keys.map((key) => [key, dom.window[key]]))
);

global.devicePixelRatio = 1;

const Excalidraw = require("@excalidraw/excalidraw");
const { argv } = require("process");

const readExcalidrawFile = async (path) => {
  try {
    const data = await fs.readFile(path, { encoding: "utf8" });
    if (data) return JSON.parse(data);
  } catch (error) {
    console.error(error);
  }
};

async function replaceFont(svg, fontFamily, fileName) {
  if (svg.match(new RegExp(`font-family="${fontFamily}\\b`))) {
    console.log(`* Embedding ${fontFamily}`);
    const fontUri = `url('/fonts/${fontFamily}.woff2') format('woff2')`;
    svg = svg.replaceAll(
      new RegExp(
        `url\\("https://.+?/${fileName || fontFamily}\\.woff2"\\)`,
        "g"
      ),
      () => fontUri
    );
  } else {
    console.log(`* Removing ${fontFamily}`);
    svg = svg.replaceAll(
      new RegExp(
        `\\s*@font-face \\{\\s*font-family: "${fontFamily}".*?\\}`,
        "gs"
      ),
      ""
    );
  }
  return svg;
}

async function replaceFonts(svg) {
  svg = await replaceFont(svg, "Virgil");
  svg = await replaceFont(svg, "Cascadia");
  svg = await replaceFont(svg, "Assistant", "Assistant-Regular");
  svg = await replaceFont(svg, "Excalifont");
  return svg;
}

const convert = async (inputFile, darkMode = false) => {
  console.log(
    `Converting ${inputFile} into ${darkMode ? "dark" : "light"} SVG`
  );
  const suffix = darkMode ? "-dark" : "-light";
  const outputFile = path.format({
    dir: path.dirname(inputFile),
    name: path.basename(inputFile, ".excalidraw") + suffix,
    ext: ".svg",
  });

  var excalidrawFile = await readExcalidrawFile(inputFile);
  excalidrawFile.appState.exportBackground = false;
  excalidrawFile.appState.exportWithDarkMode = darkMode;
  excalidrawFile.appState.exportScale = 2;

  var svg = (await Excalidraw.exportToSvg(excalidrawFile)).outerHTML;

  console.log(`Embedding fonts`);
  svg = await replaceFonts(svg);

  console.log(`Writing ${outputFile}\n`);
  return await fs.writeFile(outputFile, svg, {
    encoding: "utf8",
  });
};

const main = async () => {
  for (const inputFile of argv.slice(2)) {
    await convert(inputFile, false);
    await convert(inputFile, true);
  }
};

main().then(() => process.exit());
