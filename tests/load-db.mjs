import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createDb } from "../js/engine/units.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadDb() {
  const read = (name) => JSON.parse(readFileSync(join(root, "data", name), "utf8"));
  return createDb({ heroes: read("heroes.json"), enemies: read("enemies.json"), extensions: read("extensions.json") });
}
