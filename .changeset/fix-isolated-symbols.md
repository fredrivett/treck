---
"treck": patch
---

fix: detect call sites in conditions, JSX, new expressions, object methods, and extends

Previously, function calls in condition expressions (e.g. `if (isReady())`), JSX component
usage (e.g. `<FlowGraph />`), constructor calls (e.g. `new ContentHasher()`), calls inside
object literal methods, and class inheritance (`extends`) were not detected as call sites,
causing those symbols to appear isolated in the graph. Also removes dead legacy template code.
Reduces isolated nodes from 60 to 20 and increases edge count from 149 to 236.
