import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const roughJsBinDir = path.join(__dirname, "node_modules", "roughjs", "bin");

const ensureExtensionlessSymlinks = async (directory) => {
  let entries;

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await ensureExtensionlessSymlinks(fullPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".js")) {
      continue;
    }

    const linkPath = fullPath.slice(0, -3);
    const linkTarget = entry.name;

    try {
      const stat = await fs.lstat(linkPath);
      if (!stat.isSymbolicLink()) {
        continue;
      }

      const existingTarget = await fs.readlink(linkPath);
      if (existingTarget === linkTarget) {
        continue;
      }

      await fs.unlink(linkPath);
    } catch {}

    await fs.symlink(linkTarget, linkPath);
  }
};

await ensureExtensionlessSymlinks(roughJsBinDir);
