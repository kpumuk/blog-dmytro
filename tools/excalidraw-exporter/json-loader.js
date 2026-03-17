import { readFile } from "node:fs/promises";

const laserPointerUrl = new URL(
  "./node_modules/@excalidraw/laser-pointer/dist/esm.js",
  import.meta.url
).href;

export async function resolve(specifier, context, defaultResolve) {
  if (specifier === "@excalidraw/laser-pointer") {
    return {
      shortCircuit: true,
      url: laserPointerUrl,
    };
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url === laserPointerUrl) {
    return {
      format: "module",
      shortCircuit: true,
      source: await readFile(new URL(url), "utf8"),
    };
  }

  if (context.format === "json") {
    return defaultLoad(
      url,
      {
        ...context,
        importAttributes: {
          ...(context.importAttributes ?? {}),
          type: "json",
        },
      },
      defaultLoad
    );
  }

  return defaultLoad(url, context, defaultLoad);
}
