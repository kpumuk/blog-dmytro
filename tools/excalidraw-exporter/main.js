#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
require("jsdom-global")();

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

async function replaceFont(svg, fontFamily) {
  if (svg.match(new RegExp(`font-family="${fontFamily}\\b`))) {
    console.log(`* Embedding ${fontFamily}`);
    const fontUri = `url('/fonts/${fontFamily}.woff2') format('woff2')`;
    svg = svg.replaceAll(
      new RegExp(`url\\("https://.+?/${fontFamily}\\.woff2"\\)`, "g"),
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
