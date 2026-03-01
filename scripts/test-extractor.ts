#!/usr/bin/env tsx

/**
 * Quick script to test the symbol extractor on treck's own code
 */

import { join } from 'node:path';
import { TypeScriptExtractor } from '../src/extractors/typescript/index.js';

/** Extractor instance used for the test run. */
const extractor = new TypeScriptExtractor();

/** Path to the init command file used as the extraction test target. */
const testFile = join(process.cwd(), 'src/cli/commands/init.ts');

console.log('🔍 Extracting symbols from:', testFile);
console.log('─'.repeat(60));

/** Extraction result containing all symbols found in the test file. */
const result = extractor.extractSymbols(testFile);

console.log(`\n✅ Found ${result.symbols.length} symbols:\n`);

result.symbols.forEach((symbol, i) => {
  console.log(`${i + 1}. ${symbol.name} (${symbol.kind})`);
  console.log(`   Lines: ${symbol.startLine}-${symbol.endLine}`);
  console.log(`   Params: ${symbol.params || '(none)'}`);
  console.log(`   Body preview: ${symbol.body.substring(0, 100).replace(/\n/g, ' ')}...`);
  console.log();
});

if (result.errors.length > 0) {
  console.log('⚠️  Errors:', result.errors);
}

// Test extracting a specific symbol
console.log('─'.repeat(60));
console.log('\n🎯 Extracting specific symbol: registerInitCommand\n');

/** Single-symbol extraction test targeting `registerInitCommand`. */
const initCommand = extractor.extractSymbol(testFile, 'registerInitCommand');
if (initCommand) {
  console.log('Name:', initCommand.name);
  console.log('Kind:', initCommand.kind);
  console.log('Lines:', `${initCommand.startLine}-${initCommand.endLine}`);
  console.log('Params:', initCommand.params);
  console.log('\nFirst 200 chars of body:');
  console.log(initCommand.body.substring(0, 200));
} else {
  console.log('❌ Symbol not found');
}
