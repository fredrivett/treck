---
"treck": patch
---

Fix camera repositioning after active node changes. Previously, fitView was called before React had committed new node positions to React Flow's store, causing intermittent repositioning failures (10-30% of the time). Changed from RAF-based timing to a useEffect-driven approach that guarantees fitView runs after React's commit phase. Also fixed TypeScript extractor to only include top-level symbols, preventing duplicate node IDs that could cause layout mismatches.
