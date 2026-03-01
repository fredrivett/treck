---
"treck": patch
---

Performance and type safety improvements

- Use Set for O(1) source file lookups in graph builder (was O(n) per lookup)
- Cache "use server" file reads in Next.js matcher (avoid re-reading per symbol)
- Use pointer-based BFS queue instead of Array.shift() in graph queries
- Make `hasJsDoc` required on `GraphNode` (always set by graph builder)
- Add `ConnectionType` union type for `RuntimeConnection.type` (was `string`)
- Implement `resolveConnection` for Next.js matcher (connects fetch→API routes, navigation→pages)
- Add comprehensive test suite for Next.js matcher (28 tests)
