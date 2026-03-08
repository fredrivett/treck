# Conditional Logic Analysis

## Why this note exists

The graph pipeline is reasonably strong at symbol discovery and direct edge construction, but the weakest part of the analysis is still conditional logic extraction.

This document captures:

- how the current pipeline works
- what we improved recently
- where fidelity is still weak
- what the viable future options are if we want stronger control-flow precision

The goal is to keep future work grounded in the current architecture instead of re-discovering the same tradeoffs in later PRs.

## Current pipeline

The relevant pieces are:

- `src/extractors/typescript/index.ts`
- `src/graph/graph-builder.ts`
- `src/server/viewer/components/condition-expansion.ts`
- `src/server/viewer/components/FlowGraph.tsx`

At a high level:

1. `TypeScriptExtractor` parses source files with the TypeScript compiler API.
2. It extracts top-level symbols, imports, and call sites.
3. For each call site, it records a condition chain when the call is nested under supported control-flow constructs.
4. `GraphBuilder` resolves those call sites into graph edges.
5. Conditional call edges are stored with structured `conditions`.
6. The viewer expands those condition chains into explicit condition nodes.

This means conditional fidelity depends primarily on `extractCallSites()` in `src/extractors/typescript/index.ts`.

## What works today

The current extractor is not raw AST walking anymore. It now handles several important patterns that were previously lossy:

- explicit `if` / `else` / `else if`
- ternaries
- logical `&&` and `||` guard expressions
- JSX guard patterns
- implicit fallthrough after early `return`
- implicit fallthrough after early `throw`
- implicit fallthrough after loop `continue`
- stacked early-return guards
- pragmatic post-`switch` fallthrough conditions

The graph layer and viewer also now preserve and render nested condition chains rather than collapsing them to a single outer condition.

That gives us much better path readability for real code such as:

```ts
if (!isCollapsed) {
  if (item.type === 'dir') {
    return <TreeDir />
  }

  return <Guides />
}
```

The rendered path can now look like:

```text
!isCollapsed -> item.type === 'dir' -> TreeDir
!isCollapsed -> else (item.type === 'dir') -> Guides
```

instead of flattening everything into just `!isCollapsed`.

## Where the analysis is still weak

The extractor is still fundamentally syntax-driven. It is not doing full control-flow graph (CFG) analysis.

That means the current implementation is best described as:

- structured control-flow inference
- path-sensitive in several common cases
- still approximate in more complex statement graphs

The main weak spots are below.

### 1. No full CFG

There is no explicit graph of basic blocks, predecessors, successors, or reachability states for each function body.

Instead, we infer conditions from syntax and from a small set of "this path exits" rules.

### 2. Exit detection is intentionally shallow

`statementAlwaysTransfersControl()` currently recognizes:

- `return`
- `throw`
- `continue`
- `break` when explicitly treated as an exit for the current context
- blocks whose final statement exits
- `if/else` where both branches exit

This covers common patterns well, but it is not a full reachability engine.

### 3. Complex `switch` logic is only partially modeled

Recent work improved post-`switch` fallthrough substantially, including:

- preserving branches that can reach the switch exit
- adding an implicit `default` path when there is no explicit default
- excluding fallthrough cases that only reach a later returning case

But we still do not have full path precision for complex nested control flow inside cases.

### 4. `try` / `catch` / `finally` is not modeled precisely

This is one of the biggest remaining correctness gaps.

Example:

```ts
try {
  if (a) return foo()
  bar()
} catch {
  baz()
} finally {
  cleanup()
}

after()
```

Getting `after()` exactly right requires more than local syntax heuristics.

### 5. Loops are only partially modeled

We handle some loop-related exits, especially `continue`, but we do not model loop back-edges or full reachability within nested loop bodies.

### 6. Exceptions and short-circuit behavior remain approximate

We track visible syntax-level conditions, but we do not build a precise execution model for:

- thrown exceptions from nested calls
- evaluation order subtleties beyond the current supported patterns
- interaction between multiple nested branching constructs

## Why this matters

Conditional path fidelity directly affects graph trustworthiness.

When the graph shows:

```text
A -> condition -> B
```

users assume that path reflects real execution logic, not just approximate syntax ancestry.

That is why this part of the pipeline matters more than most other extraction heuristics. A slightly missed symbol is annoying. A confidently wrong logic path is misleading.

## Current recommendation

The current implementation is good enough to keep improving incrementally, but not good enough to call "fully faithful" in the compiler-analysis sense.

For future work, the decision should be made explicitly:

- if we want better coverage of common patterns, continue the current heuristic path
- if we want true path fidelity, move toward a real CFG-backed analysis pass

## Options we researched

As of 2026-03-08, the realistic options are below.

### Option 1: Keep extending the current TypeScript-based extractor

Description:

- stay on the TypeScript compiler API
- keep the current syntax-driven extractor
- add more targeted reachability rules over time

Pros:

- lowest disruption
- preserves the current architecture
- keeps graph generation simple and local
- fastest for normal graph builds

Cons:

- correctness becomes harder to reason about as heuristics accumulate
- subtle cases will keep slipping through
- there is no clean boundary where this turns into "real CFG analysis"

When this is the right choice:

- if we only need to keep improving common frontend/control-flow patterns
- if graph build speed matters more than perfect semantic precision

### Option 2: Use `@typescript-eslint` plus ESLint code-path analysis

Description:

- parse TS/TSX with `@typescript-eslint/parser` or `@typescript-eslint/typescript-estree`
- use ESLint's code-path analysis for control-flow structure
- map back to TypeScript nodes using parser services where needed

Why this is attractive:

- strong TS/TSX support
- actively maintained
- uses a real code-path model rather than ad hoc syntax ancestry
- still feasible as an in-repo analysis step

Important detail:

This is not a tiny drop-in package that returns "the CFG". It is an ESLint-style analysis model. Integrating it cleanly would likely mean a dedicated analysis pass or rule-like traversal for call-site extraction.

Pros:

- best fit if we want stronger path reasoning without adopting a heavyweight external platform
- maintained ecosystem
- parser services can bridge ESTree nodes back to TypeScript nodes and a `ts.Program`

Cons:

- requires AST/tooling adaptation because our current extractor is TS-AST native
- not as precise or queryable as a full analysis platform like CodeQL
- still some engineering work to integrate cleanly into this graph pipeline

Current assessment:

This is the best future option if we want a serious upgrade while staying inside the product architecture.

References:

- <https://eslint.org/docs/latest/extend/code-path-analysis>
- <https://eslint.org/docs/latest/extend/custom-rules>
- <https://typescript-eslint.io/packages/parser/>
- <https://typescript-eslint.io/packages/typescript-estree/>
- <https://typescript-eslint.io/getting-started/typed-linting/>

### Option 3: Use TypeScript compiler internals for flow analysis

Description:

- stay on the TypeScript compiler
- attempt to read internal flow metadata such as `flowNode`

What we verified locally:

- the installed `typescript` package in this repo is `5.9.3`
- runtime exports include `FlowFlags` and `canHaveFlowNode`
- `node.flowNode` does appear to be populated when using a real `Program` and forcing type-checker work
- there is no declared public `FlowNode` API or public `getControlFlowGraph()` API in the installed typings

Pros:

- minimal conceptual mismatch with the current extractor
- potentially the cheapest spike
- no second parser required

Cons:

- relies on unsupported internal compiler behavior
- likely brittle across TypeScript upgrades
- poor long-term foundation for product code

Current assessment:

This is reasonable for a prototype or research branch, but not a good basis for a maintained feature unless we accept compiler-internal breakage risk.

Reference:

- <https://github.com/microsoft/TypeScript-Compiler-Notes>

### Option 4: Use CodeQL

Description:

- extract the codebase into a CodeQL database
- run JS/TS control-flow queries over that database

Why this is attractive:

- it has a real CFG model
- it is the strongest option in terms of path-analysis capability

Why it is not an inline replacement:

- CodeQL is designed as a static-analysis platform, not as an embeddable library call inside our current extractor
- it wants a database creation step and query execution step

Pros:

- strongest precision potential
- explicit control-flow primitives
- good choice if exact static-analysis fidelity becomes a core product requirement

Cons:

- heavy architecture for our use case
- slower than the current inline extractor model
- operational complexity: database lifecycle, query authoring, result translation

Current assessment:

This is the best option if we eventually decide to build a more heavyweight analysis pipeline. It is not the best option for lightweight graph generation inside the current build path.

References:

- <https://codeql.github.com/codeql-standard-libraries/javascript/semmle/javascript/CFG.qll/module.CFG.html>
- <https://codeql.github.com/codeql-standard-libraries/javascript/semmle/javascript/CFG.qll/type.CFG%24ControlFlowNode.html>
- <https://docs.github.com/en/code-security/tutorials/customize-code-scanning/preparing-your-code-for-codeql-analysis?learn=code_security_ci&learnProduct=code-security>

### Option 5: Use `esgraph`

Description:

- use the `esgraph` package to build CFGs from JavaScript ASTs

Why this is not a good fit:

- it targets Esprima ASTs
- it is not TypeScript/TSX-native
- it is old and not an actively compelling choice for this codebase

Current assessment:

Not recommended beyond a toy prototype.

Reference:

- <https://www.npmjs.com/package/esgraph>

## Recommended direction for future PRs

The current recommendation is:

1. Continue improving the existing extractor only for clearly bounded gaps.
2. Avoid pretending the current analysis is fully faithful.
3. If we decide conditional-path fidelity is a top-tier product concern, prototype `@typescript-eslint` plus ESLint code-path analysis as the next serious step.
4. Keep CodeQL in reserve for a future architecture where offline static analysis is acceptable.

## Practical next steps

If and when we return to this area, the most sensible sequence is:

1. Build a small prototype that runs `@typescript-eslint` parsing and ESLint code-path analysis on a few representative files.
2. Compare its extracted call-site conditions against the current extractor on known tricky cases:
   - nested `if` chains
   - stacked early returns
   - `switch` with fallthrough
   - `try/catch/finally`
   - loop-heavy code
3. Decide whether the gain in fidelity justifies a second analysis pass or broader refactor.

## Bottom line

Today we have a solid heuristic conditional extractor, not a full CFG engine.

That is good enough to ship useful graphs, but the core weak area remains the same: faithfully extracting logic paths in the presence of non-trivial control flow.

If we want materially better correctness without jumping to a heavyweight sidecar architecture, `@typescript-eslint` plus ESLint code-path analysis is the strongest next option.
