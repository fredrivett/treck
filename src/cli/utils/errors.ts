/**
 * Custom error classes for treck CLI
 */

/** Base error class for all treck errors. */
export class TreckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TreckError';
  }
}

/** Thrown when the treck configuration file is invalid or missing required fields. */
export class ConfigError extends TreckError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Thrown when symbol extraction from a source file fails. */
export class ExtractionError extends TreckError {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}
