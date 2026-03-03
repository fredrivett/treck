---
"treck": patch
---

Refactor Next.js matcher and supporting types for clarity and performance

- Remove `readFileSync` from `detectEntryPoint` — server action detection now uses `symbol.directives` populated by the extractor
- Add `directives` field to `SymbolInfo` for file-level directives (`"use server"`, `"use client"`)
- Replace encoded `fetch:POST` type string with explicit `httpMethod` field on `RuntimeConnection`
- Simplify `ResolvedConnection` to use `targetName: string` instead of a full stub `SymbolInfo`
- Replace O(n) route file scan with a cached `Map<routePath, filePath>` for O(1) lookups
