/**
 * Generates a showcase graph.json for an external TypeScript project.
 *
 * Usage: tsx scripts/generate-showcase.ts <slug>
 *
 * Clones the project, runs treck sync, and copies the resulting graph.json
 * into website/public/showcases/<slug>.json.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface ProjectConfig {
  repo: string;
  branch?: string;
  include: string[];
  exclude?: string[];
}

const projects: Record<string, ProjectConfig> = {
  tldraw: {
    repo: 'https://github.com/tldraw/tldraw.git',
    include: ['packages/tldraw/src/**/*.{ts,tsx}', 'packages/editor/src/**/*.{ts,tsx}'],
    exclude: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/__tests__/**',
      '**/test/**',
      '**/*.d.ts',
    ],
  },
};

const DEFAULT_EXCLUDES = [
  '**/*.test.{ts,tsx,js,jsx}',
  '**/*.spec.{ts,tsx,js,jsx}',
  '**/__tests__/**',
  '**/e2e/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
];

function generateConfig(project: ProjectConfig): string {
  const excludes = [...DEFAULT_EXCLUDES, ...(project.exclude ?? [])];
  const includeYaml = project.include.map((p) => `    - ${p}`).join('\n');
  const excludeYaml = excludes.map((p) => `    - ${p}`).join('\n');

  return `output:
  dir: _treck

scope:
  include:
${includeYaml}

  exclude:
${excludeYaml}
`;
}

function run(cmd: string, cwd: string): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

const slug = process.argv[2];

if (!slug) {
  console.error('Usage: tsx scripts/generate-showcase.ts <slug>');
  console.error(`Available projects: ${Object.keys(projects).join(', ')}`);
  process.exit(1);
}

const project = projects[slug];
if (!project) {
  console.error(`Unknown project: ${slug}`);
  console.error(`Available projects: ${Object.keys(projects).join(', ')}`);
  process.exit(1);
}

const rootDir = resolve(import.meta.dirname, '..');
const tmpDir = resolve(rootDir, '.showcase-tmp', slug);
const outFile = resolve(rootDir, 'website', 'public', 'showcases', `${slug}.json`);
const treckBin = resolve(rootDir, 'dist', 'index.mjs');

// Ensure treck is built
if (!existsSync(treckBin)) {
  console.log('Building treck CLI...');
  run('pnpm run build', rootDir);
}

// Clean up any previous run
if (existsSync(tmpDir)) {
  rmSync(tmpDir, { recursive: true });
}
mkdirSync(tmpDir, { recursive: true });

console.log(`\nGenerating showcase for: ${slug}`);
console.log(`Cloning ${project.repo}...`);
run(`git clone --depth 1 ${project.branch ? `-b ${project.branch}` : ''} ${project.repo} ${tmpDir}`, rootDir);

// Write treck config
const configDir = resolve(tmpDir, '_treck');
mkdirSync(configDir, { recursive: true });
writeFileSync(resolve(configDir, 'config.yaml'), generateConfig(project));
console.log('Wrote _treck/config.yaml');

// Run treck sync
console.log('Running treck sync...');
run(`node ${treckBin} sync`, tmpDir);

// Copy graph.json
const graphFile = resolve(configDir, 'graph.json');
if (!existsSync(graphFile)) {
  console.error('Error: graph.json was not generated');
  process.exit(1);
}

mkdirSync(resolve(rootDir, 'website', 'public', 'showcases'), { recursive: true });
cpSync(graphFile, outFile);
console.log(`\nGraph written to: ${outFile}`);

// Show stats
const graph = JSON.parse(readFileSync(outFile, 'utf8'));
console.log(`  Nodes: ${graph.nodes.length}`);
console.log(`  Edges: ${graph.edges.length}`);

// Clean up
rmSync(tmpDir, { recursive: true });
console.log('Cleaned up temp directory');
console.log('Done!');
