import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { presetSchema, type Preset } from "@num/shared";

export function presetsDirectory(): string {
  return join(import.meta.dir, "..", "..", "..", "..", "presets");
}

export function loadPresets(directory = presetsDirectory()): Preset[] {
  const names = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const presets = names.map((name) =>
    presetSchema.parse(JSON.parse(readFileSync(join(directory, name), "utf8"))),
  );
  const ids = new Set<string>();
  for (const preset of presets) {
    if (ids.has(preset.id)) {
      throw new Error(`Preset id is used two times: ${preset.id}`);
    }
    ids.add(preset.id);
  }
  return presets;
}
