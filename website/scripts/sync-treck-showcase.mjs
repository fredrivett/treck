/**
 * Regenerates the treck self-showcase graph before the website build.
 *
 * Builds the treck CLI (if needed), runs `treck sync` at the repo root,
 * and copies the resulting graph.json into the website's public showcases.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '../..');
const treckBin = resolve(rootDir, 'dist/index.mjs');
const graphSrc = resolve(rootDir, '_treck/graph.json');
const graphDest = resolve(import.meta.dirname, '../public/showcases/treck.json');

function run(cmd, cwd) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// Build treck CLI if not already built
if (!existsSync(treckBin)) {
  console.log('Building treck CLI...');
  run('pnpm exec tsdown src/cli/index.ts', rootDir);
}

// Run treck sync to regenerate graph.json
console.log('Running treck sync...');
run(`node ${treckBin} sync`, rootDir);

// Copy to website showcases
mkdirSync(resolve(import.meta.dirname, '../public/showcases'), { recursive: true });
cpSync(graphSrc, graphDest);
console.log(`Copied graph to ${graphDest}`);
