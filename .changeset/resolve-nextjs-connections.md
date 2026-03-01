---
"treck": patch
---

Resolve Next.js runtime connections (fetch → API route, router.push → page)

- Implement `resolveConnection` for fetch connections in the Next.js matcher, matching `/api/...` URLs to their corresponding route handler files
- Add fallback metadata matching in the graph builder for both `fetch` and `navigation` connection types, connecting them to API route and page nodes by their route metadata
- Fix page detection to handle named default exports (e.g. `export default function DashboardPage()`)
- When `resolveConnection` returns a target not in the graph, fall through to metadata-based matching instead of silently dropping the connection
