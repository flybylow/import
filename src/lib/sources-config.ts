import fs from "fs";
import path from "path";

export type SourceEntry = {
  id: string;
  type: string;
  ttlPath: string;
  enabled?: boolean;
};

export type SourcesConfig = {
  sources: SourceEntry[];
};

export function configPath(cwd = process.cwd()): string {
  return path.join(cwd, "config.json");
}

export function loadSourcesConfig(cwd = process.cwd()): SourcesConfig {
  const p = configPath(cwd);
  if (!fs.existsSync(p)) {
    return { sources: [] };
  }
  const raw = fs.readFileSync(p, "utf-8");
  const json = JSON.parse(raw) as SourcesConfig;
  if (!json || !Array.isArray(json.sources)) {
    return { sources: [] };
  }
  return json;
}

export function saveSourcesConfig(config: SourcesConfig, cwd = process.cwd()) {
  const p = configPath(cwd);
  fs.writeFileSync(p, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function resolveSourceTtlPath(
  entry: SourceEntry,
  cwd = process.cwd()
): string {
  return path.join(cwd, entry.ttlPath);
}

export function sourceTtlExists(
  entry: SourceEntry,
  cwd = process.cwd()
): boolean {
  return fs.existsSync(resolveSourceTtlPath(entry, cwd));
}
