import { readFileSync } from "node:fs";
import path from "node:path";

const laserPointerUrl = new URL(
  "./node_modules/@excalidraw/laser-pointer/dist/esm.js",
  import.meta.url
).href;

export function resolve(specifier, context, nextResolve) {
  if (specifier === "@excalidraw/laser-pointer") {
    return {
      shortCircuit: true,
      url: laserPointerUrl,
    };
  }

  if (
    specifier.startsWith("roughjs/bin/") &&
    !path.extname(specifier)
  ) {
    return nextResolve(`${specifier}.js`, context);
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !path.extname(specifier) &&
    context.parentURL?.includes("/roughjs/bin/")
  ) {
    return nextResolve(`${specifier}.js`, context);
  }

  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url === laserPointerUrl) {
    return {
      format: "module",
      shortCircuit: true,
      source: readFileSync(new URL(url), "utf8"),
    };
  }

  if (context.format === "json") {
    return nextLoad(url, {
      ...context,
      importAttributes: {
        ...(context.importAttributes ?? {}),
        type: "json",
      },
    });
  }

  return nextLoad(url, context);
}
