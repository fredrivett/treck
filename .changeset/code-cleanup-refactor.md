---
"treck": patch
---

Remove dead code and tighten internal APIs

- Remove unused `DocMetadata` and `DocDependency` types from checker
- Remove unused `hashSymbol` standalone function, `hasChanged`, and `shortHash` methods from hasher
- Remove unused `ValidationError` and `GenerationError` error classes
- Remove type re-exports from `checker/index.ts` and `server/index.ts`
- Delete dead `extractors/index.ts` barrel file (no consumers)
- Remove deprecated `entryNodeId` param from `flowToMermaid` (only `highlightIds` remains)
- Simplify `connectionTypeToEdgeType` switch statement
- Extract shared symbol extraction and aggregation logic in `jsdoc-coverage.ts`
- Add missing TSDoc to `TreckConfig` and `ProjectScan`
