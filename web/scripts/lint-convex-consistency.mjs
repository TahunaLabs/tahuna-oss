import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const convexDir = path.join(root, "convex");

const importRe = /^\s*import\s+[\s\S]*?\s+from\s+["']([^"']+)["'];?\s*$/;

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    if (entry.isFile() && full.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

const files = walk(convexDir).filter((file) => {
  const normalized = rel(file);
  if (normalized.includes("/_generated/")) return false;
  if (normalized === "convex/auth.ts") return false; // Explicitly excluded by project rule.
  return true;
});

const failures = [];

for (const file of files) {
  const normalized = rel(file);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(importRe);
    if (!match) continue;
    const source = match[1] ?? "";

    // Convex consistency rule: no relative imports in convex modules.
    if (source.startsWith("./") || source.startsWith("../")) {
      failures.push(
        `${normalized}:${i + 1} relative import "${source}" is not allowed in convex modules; use @convex/* or @/* aliases.`,
      );
      continue;
    }

    // Centralize config access through @convex/appConfig (except appConfig itself).
    if (normalized !== "convex/appConfig.ts" && source === "@/config") {
      failures.push(
        `${normalized}:${i + 1} direct "@/config" import is not allowed; import from "@convex/appConfig" instead.`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Convex import consistency lint failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Convex import consistency lint passed.");
