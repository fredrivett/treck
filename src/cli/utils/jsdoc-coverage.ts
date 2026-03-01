/**
 * JSDoc coverage scanning and reporting.
 *
 * Scans project source files for JSDoc coverage and renders
 * coverage statistics and missing-symbol lists to the CLI.
 */

import * as p from '@clack/prompts';
import { isTrivialBody } from '../../extractors/trivial.js';
import { TypeScriptExtractor } from '../../extractors/typescript/index.js';
import type { TreckConfig } from './config.js';
import { findSourceFiles, findSourceFilesAsync, getRelativePath } from './source-files.js';

export interface ProjectScan {
  sourceFiles: string[];
  allSymbols: {
    file: string;
    symbol: { name: string; hasJsDoc: boolean; isExported: boolean; isTrivial: boolean };
  }[];
  totalSymbols: number;
  exportedSymbols: number;
  withJsDoc: number;
}

/**
 * Scan the project and return coverage data.
 */
export function scanProject(scope: TreckConfig['scope']): ProjectScan {
  const sourceFiles = findSourceFiles(process.cwd(), scope);
  const allSymbols: ProjectScan['allSymbols'] = [];

  if (sourceFiles.length > 0) {
    const extractor = new TypeScriptExtractor();
    for (const file of sourceFiles) {
      try {
        const result = extractor.extractSymbols(file);
        for (const symbol of result.symbols) {
          allSymbols.push({
            file,
            symbol: {
              name: symbol.name,
              hasJsDoc: symbol.jsDoc !== undefined,
              isExported: symbol.isExported ?? false,
              isTrivial: isTrivialBody(symbol.body),
            },
          });
        }
      } catch {
        // Skip files that can't be parsed
      }
    }
  }

  const totalSymbols = allSymbols.length;
  const nonTrivialExported = (s: (typeof allSymbols)[number]) =>
    s.symbol.isExported && !s.symbol.isTrivial;
  const exportedSymbols = allSymbols.filter(nonTrivialExported).length;
  const withJsDoc = allSymbols.filter((s) => nonTrivialExported(s) && s.symbol.hasJsDoc).length;

  return {
    sourceFiles,
    allSymbols,
    totalSymbols,
    exportedSymbols,
    withJsDoc,
  };
}

/** Yield to the event loop so spinner animations stay smooth during CPU-bound work. */
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Async version of scanProject that yields throughout
 * so spinner animations stay smooth.
 */
export async function scanProjectAsync(
  scope: TreckConfig['scope'],
  onProgress?: (message: string) => void,
): Promise<ProjectScan> {
  // Phase 1: find source files (async fs, yields naturally at each I/O)
  const sourceFiles = await findSourceFilesAsync(process.cwd(), scope);

  const allSymbols: ProjectScan['allSymbols'] = [];

  if (sourceFiles.length > 0) {
    onProgress?.(`Analyzing ${sourceFiles.length} source files`);
    await tick();

    // Phase 2: extract symbols, yielding every batch of files
    const extractor = new TypeScriptExtractor();
    for (let i = 0; i < sourceFiles.length; i++) {
      try {
        const result = extractor.extractSymbols(sourceFiles[i]);
        for (const symbol of result.symbols) {
          allSymbols.push({
            file: sourceFiles[i],
            symbol: {
              name: symbol.name,
              hasJsDoc: symbol.jsDoc !== undefined,
              isExported: symbol.isExported ?? false,
              isTrivial: isTrivialBody(symbol.body),
            },
          });
        }
      } catch {
        // Skip files that can't be parsed
      }
      if (i % 10 === 9) await tick();
    }
  }

  const totalSymbols = allSymbols.length;
  const nonTrivialExported = (s: (typeof allSymbols)[number]) =>
    s.symbol.isExported && !s.symbol.isTrivial;
  const exportedSymbols = allSymbols.filter(nonTrivialExported).length;
  const withJsDoc = allSymbols.filter((s) => nonTrivialExported(s) && s.symbol.hasJsDoc).length;

  return {
    sourceFiles,
    allSymbols,
    totalSymbols,
    exportedSymbols,
    withJsDoc,
  };
}

/**
 * Render JSDoc coverage stats (progress bar + percentage).
 */
export function renderJsDocCoverageStats(scan: ProjectScan): void {
  const jsDocCoverage =
    scan.exportedSymbols > 0 ? Math.round((scan.withJsDoc / scan.exportedSymbols) * 100) : 0;
  const withoutJsDoc = scan.exportedSymbols - scan.withJsDoc;
  const barWidth = 30;
  const filled = Math.round((jsDocCoverage / 100) * barWidth);
  const empty = barWidth - filled;
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
  const coverageColor =
    jsDocCoverage >= 75
      ? '\uD83D\uDFE2'
      : jsDocCoverage >= 50
        ? '\uD83D\uDFE1'
        : jsDocCoverage >= 25
          ? '\uD83D\uDFE0'
          : '\uD83D\uDD34';

  p.log.message(
    [
      `Source Files: ${scan.sourceFiles.length}`,
      `Total Symbols: ${scan.totalSymbols}`,
      `Exported with JSDoc: ${scan.withJsDoc}`,
      `Exported without JSDoc: ${withoutJsDoc}`,
      '',
      `${coverageColor} JSDoc Coverage (exported): ${bar} ${jsDocCoverage}%`,
    ].join('\n'),
  );
}

/**
 * Render the list of symbols missing JSDoc comments, grouped by file.
 *
 * Shows all symbols when `verbose` is true or when the total count is 20 or fewer.
 * Otherwise, prints a hint to use --verbose.
 *
 * @param scan - Project scan result containing symbol data
 * @param verbose - Whether to force-show all symbols regardless of count
 */
export function renderMissingJsDocList(scan: ProjectScan, verbose: boolean): void {
  const withoutJsDoc = scan.exportedSymbols - scan.withJsDoc;

  if (withoutJsDoc === 0) return;

  if (verbose || withoutJsDoc <= 20) {
    const missingJsDoc = scan.allSymbols.filter(
      (s) => s.symbol.isExported && !s.symbol.isTrivial && !s.symbol.hasJsDoc,
    );

    const byFile = new Map<string, string[]>();
    for (const { file, symbol } of missingJsDoc) {
      const relativePath = getRelativePath(file);
      if (!byFile.has(relativePath)) {
        byFile.set(relativePath, []);
      }
      byFile.get(relativePath)?.push(symbol.name);
    }

    const lines: string[] = [];
    for (const [file, symbols] of byFile) {
      lines.push(`\u{1F4C4} ${file}`);
      for (const sym of symbols) {
        lines.push(`   \u2022 ${sym}`);
      }
    }

    p.log.warn('Symbols missing JSDoc:');
    p.log.message(lines.join('\n'));
  } else {
    p.log.message(
      `\u{1F4A1} \x1b[3mUse --verbose to see all ${withoutJsDoc} symbols missing JSDoc\x1b[23m`,
    );
  }
}
