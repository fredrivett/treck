import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Parsed treck project configuration from `_treck/config.yaml`. */
export interface TreckConfig {
  outputDir: string;
  scope: {
    include: string[];
    exclude: string[];
  };
}

/**
 * Load the treck configuration from `_treck/config.yaml`.
 *
 * Parses the YAML config file to extract the output directory and
 * include/exclude scope patterns. Returns null if no config file exists.
 *
 * @param cwd - Working directory to resolve the config path from
 */
export function loadConfig(cwd = process.cwd()): TreckConfig | null {
  const configPath = resolve(cwd, '_treck/config.yaml');
  if (!existsSync(configPath)) return null;

  const content = readFileSync(configPath, 'utf-8');

  const dirMatch = content.match(/^\s*dir:\s*(.+)/m);
  const outputDir = dirMatch ? stripQuotes(dirMatch[1].trim()) : '_treck';

  const include = parseYamlList(content, 'include');
  const exclude = parseYamlList(content, 'exclude');

  return {
    outputDir,
    scope: { include, exclude },
  };
}

/**
 * Parse a YAML list under a given key.
 * Finds `key:` on its own line, then collects subsequent `- value` lines.
 * Skips blank lines and comment lines within the list.
 */
function parseYamlList(content: string, key: string): string[] {
  const keyPattern = new RegExp(`^\\s*${key}:\\s*(?:#.*)?$`, 'm');
  const keyMatch = keyPattern.exec(content);
  if (!keyMatch) return [];

  const afterKey = content.slice(keyMatch.index + keyMatch[0].length);
  const items: string[] = [];

  for (const line of afterKey.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const listItemMatch = trimmed.match(/^-\s+(.+)/);
    if (listItemMatch) {
      const value = listItemMatch[1].replace(/\s+#.*$/, '').trim();
      items.push(stripQuotes(value));
    } else {
      break;
    }
  }

  return items;
}

/** Remove surrounding single or double quotes from a string value. */
function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
