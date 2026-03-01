/**
 * Content hasher for detecting symbol changes
 *
 * Hashes params + body (not name) so renames don't trigger staleness
 */

import { createHash } from 'node:crypto';
import type { SymbolInfo } from '../extractors/types.js';

/** SHA256 content hasher for detecting symbol changes. Hashes params + body (not name) so renames don't trigger staleness. */
export class ContentHasher {
  /**
   * Hash symbol content (params + body, excluding name)
   * This allows renames without triggering staleness
   */
  hashSymbol(symbol: SymbolInfo): string {
    const content = this.getHashableContent(symbol);
    return this.hash(content);
  }

  /**
   * Get the content that should be hashed
   * Includes: params + body
   * Excludes: name, export keywords, visibility modifiers
   */
  getHashableContent(symbol: SymbolInfo): string {
    // Combine params and body
    // We normalize whitespace to avoid formatting changes triggering staleness
    const normalized = this.normalizeWhitespace(`${symbol.params}${symbol.body}`);
    return normalized;
  }

  /**
   * Hash a string using SHA256
   */
  hash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Normalize whitespace to prevent formatting changes from changing hash
   * - Converts multiple spaces to single space
   * - Removes leading/trailing whitespace
   * - Normalizes line endings
   */
  private normalizeWhitespace(content: string): string {
    return content
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\t/g, '  ') // Convert tabs to spaces
      .replace(/[ ]+/g, ' ') // Multiple spaces to single
      .trim();
  }

  /**
   * Compare two symbols to see if content changed
   */
  hasChanged(oldSymbol: SymbolInfo, newSymbol: SymbolInfo): boolean {
    return this.hashSymbol(oldSymbol) !== this.hashSymbol(newSymbol);
  }

  /**
   * Get a short hash (first 8 chars) for display purposes
   */
  shortHash(hash: string): string {
    return hash.substring(0, 8);
  }
}

/**
 * Convenience function to hash symbol content
 */
export function hashSymbol(symbol: SymbolInfo): string {
  const hasher = new ContentHasher();
  return hasher.hashSymbol(symbol);
}
