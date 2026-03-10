# treck

## 0.2.5

### Patch Changes

- 9520022: Add Cal.com showcase
- 43679e7: Enhance chat UI with tool call visibility, node selection sync, and improved styling. Surface search_nodes and select_nodes tool calls as step indicators in chat. Add useNodeSelection hook for shared selection state between graph and chat with cmd+click toggle support. Implement badge colors matching node categories with consistent dimming. Extract shared color definitions and dimmed opacity classes.
- 2c927f1: Replace substring search with MiniSearch for multi-word, camelCase-aware search with fuzzy matching and relevance scoring
- 22e3c62: Prefix page title with git branch name for worktree identification
- 5bec47d: Use collapsible chat panel to prevent sidebar width shift when toggling chat visibility. Instead of conditionally mounting/unmounting the chat panel (which caused proportional resizing of other panels), the panel is now always mounted and collapsed/expanded imperatively.
- 63771e2: Add category-colored tooltips to sidebar and info icons to graph nodes
- 730a284: Add clear button to search input and debounce search to prevent dropped keystrokes
- 844b5cf: Tweak file path tooltip positioning, delay, and zoom threshold.

## 0.2.4

### Patch Changes

- 79aaff4: Add `--beautify` option to `treck show` for rendering mermaid diagrams as Unicode box-drawing art in the terminal
- b8d46fe: Add ASCII output format and theme detection to `treck diff` and `treck show`. Includes dark/light terminal auto-detection, custom `--theme` override, and shape-based diff highlighting (subroutine ([[]] for modified, hexagon {{}} for added, asymmetric >] for entry points) for ASCII rendering. Adds progressive depth fallback to prevent OOM on large graphs.
- 201d131: Add treck diff command and diff_graph MCP tool for branch comparison
- e388490: Add LoadingEllipsis component with CSS keyframe animations. Replace static "Loading..." and "Thinking..." text throughout the viewer with animated ellipsis dots for improved UX feedback during async operations.
- d4ef9fd: Add `treck mcp` command — MCP server exposing graph queries as tools for AI agents
- 60d2fb8: Add `treck show` command for CLI graph output in mermaid and markdown formats
- 2502467: Add showcases section to website with interactive flow graph viewer for popular TypeScript projects (tldraw, treck). Extracts FlowGraph viewer as reusable React component embedded directly in Astro pages.
- c29c183: Improve component node color legibility in dark mode and add theme toggle to viewer and website. Adds light/dark/auto theme toggle adapted from abode project. Theme preference persists in localStorage with inline script to prevent FOUC. FlowGraph detects dark mode reactively via MutationObserver. All marketing pages and showcase viewer now use theme-aware Tailwind classes. Component nodes now use orange-900/20 background in dark mode for better legibility instead of orange-950.
- d40f3e1: Add Astro website for treck.dev with landing page, pnpm workspaces setup
- f61e936: Automate showcase graph regeneration. Treck self-graph now regenerates on every website build via a prebuild script. External showcases (tldraw) regenerate daily via GitHub Actions and auto-commit to main.
- 47d45da: Cache parsed ASTs in TypeScriptExtractor so each file is read and parsed once per build instead of once per extraction method
- ef11f4e: Migrate chat to Vercel AI SDK v6, make panel inline on desktop, and fix error handling. Improvements include incremental streaming responses, responsive panel layout (inline sidebar on desktop, drawer on mobile), and proper error handling for aborted requests.
- bd4192e: Add shadcn Tooltip component for file path hover display in graph nodes. Hide file paths during React Flow measurement phase so node width is driven by title and badges only.
- 2d949e8: Remove dead code and tighten internal APIs

  - Remove unused `DocMetadata` and `DocDependency` types from checker
  - Remove unused `hashSymbol` standalone function, `hasChanged`, and `shortHash` methods from hasher
  - Remove unused `ValidationError` and `GenerationError` error classes
  - Remove type re-exports from `checker/index.ts` and `server/index.ts`
  - Delete dead `extractors/index.ts` barrel file (no consumers)
  - Remove deprecated `entryNodeId` param from `flowToMermaid` (only `highlightIds` remains)
  - Simplify `connectionTypeToEdgeType` switch statement
  - Extract shared symbol extraction and aggregation logic in `jsdoc-coverage.ts`
  - Add missing TSDoc to `TreckConfig` and `ProjectScan`

- 46e9773: Add dark mode support to the viewer for website showcase pages
- 0a5f273: Merge edge conditions instead of silently dropping duplicate calls. When the same function is called multiple times conditionally, labels are now combined as `(A) or (B)` rather than keeping only the first condition.
- 5d9673a: Add copy-to-clipboard button on install command with lucide icons, and include website dev server in run script
- 49dfdc0: Expand trigger.dev matcher to cover the full SDK API surface: schemaTask and schedules.task entry points, instance-based triggers (myTask.trigger/triggerAndWait/batchTrigger/batchTriggerAndWait), batch.trigger/triggerByTask multi-task batching, and tasks.batchTriggerAndWait/triggerAndPoll
- c768bfe: Improve graph conditional-path fidelity by preserving distinct conditional edges, rendering nested condition chains in the viewer, and extracting implicit fallthrough logic from early returns and switch branches. Also fix conditional graph fitting when toggling visible condition nodes and document the current analysis limits and future options.
- c774104: Fix camera repositioning after active node changes. Previously, fitView was called before React had committed new node positions to React Flow's store, causing intermittent repositioning failures (10-30% of the time). Changed from RAF-based timing to a useEffect-driven approach that guarantees fitView runs after React's commit phase. Also fixed TypeScript extractor to only include top-level symbols, preventing duplicate node IDs that could cause layout mismatches.
- 9bd9385: Fix path traversal vulnerability in server, correct package.json main field and dependency placement, remove dead barrel re-exports, add missing TSDoc, and optimize import resolution with Set lookups
- f3a2ef7: fix: detect call sites in conditions, JSX, new expressions, object methods, and extends

  Previously, function calls in condition expressions (e.g. `if (isReady())`), JSX component
  usage (e.g. `<FlowGraph />`), constructor calls (e.g. `new ContentHasher()`), calls inside
  object literal methods, and class inheritance (`extends`) were not detected as call sites,
  causing those symbols to appear isolated in the graph. Also removes dead legacy template code.
  Reduces isolated nodes from 60 to 20 and increases edge count from 149 to 236.

- fbd6555: Fix false positives in Inngest and Trigger.dev matchers by replacing regex-based detection with structured initializerCall metadata and import verification
- 22128de: Fix node opacity dimming when nodes are focused. Node dimming now correctly applies when either selected or focused entries exist, and the async layout callback no longer overwrites dimmed state.
- 83bd53f: Fix viewer error messages to reference correct `treck sync` command instead of non-existent `treck graph` command
- 4fa6d6b: Improve Inngest matcher: add step.sendEvent() detection, support array syntax for inngest.send(), update step.invoke() for new API with step names, add inngest-invoke resolution in graph builder, and add comprehensive tests
- 9c7690c: Move resolve-import from extractors into graph where its consumer lives
- d76466d: Fix `nodeToMermaid` default depth to `Infinity` to match CLI and viewer behaviour
- 4a1d405: Add missing reviewer follow-ups for viewer settings and keyboard improvements:

  - add unit tests for keyboard platform detection helpers
  - add missing TSDoc comments for exported UI button/card symbols
  - include changeset required by contribution rules

- c80eaf8: Add per-graph chat history with IndexedDB persistence
- b7356ee: Performance and type safety improvements

  - Use Set for O(1) source file lookups in graph builder (was O(n) per lookup)
  - Cache "use server" file reads in Next.js matcher (avoid re-reading per symbol)
  - Use pointer-based BFS queue instead of Array.shift() in graph queries
  - Make `hasJsDoc` required on `GraphNode` (always set by graph builder)
  - Add `ConnectionType` union type for `RuntimeConnection.type` (was `string`)
  - Implement `resolveConnection` for Next.js matcher (connects fetch→API routes, navigation→pages)
  - Add comprehensive test suite for Next.js matcher (28 tests)

- 2c655fc: Add tip about quoting paths with parentheses/brackets in CLI help text and README
- 149e3a7: Add recenter button that appears when viewport drifts from fitted view. Includes motion/react animations for smooth fade in/out.
- 6b55bcc: Redesign landing page with Geist font pairing, sharp corners, and dev-focused styling
- 21a9f10: Refactor Next.js matcher and supporting types for clarity and performance

  - Remove `readFileSync` from `detectEntryPoint` — server action detection now uses `symbol.directives` populated by the extractor
  - Add `directives` field to `SymbolInfo` for file-level directives (`"use server"`, `"use client"`)
  - Replace encoded `fetch:POST` type string with explicit `httpMethod` field on `RuntimeConnection`
  - Simplify `ResolvedConnection` to use `targetName: string` instead of a full stub `SymbolInfo`
  - Replace O(n) route file scan with a cached `Map<routePath, filePath>` for O(1) lookups

- 969172c: Remove redundant `treck status` command — use `treck jsdoc` instead
- ab06c09: Reorganize extractor directory into extractors with per-extractor subdirectories
- 26e218a: Resolve Next.js runtime connections (fetch → API route, router.push → page)

  - Implement `resolveConnection` for fetch connections in the Next.js matcher, matching `/api/...` URLs to their corresponding route handler files
  - Add fallback metadata matching in the graph builder for both `fetch` and `navigation` connection types, connecting them to API route and page nodes by their route metadata
  - Fix page detection to handle named default exports (e.g. `export default function DashboardPage()`)
  - When `resolveConnection` returns a target not in the graph, fall through to metadata-based matching instead of silently dropping the connection

- 3a23749: Support dark mode in mermaid dependency graphs. Render flowcharts as SVG with CSS variables that adapt to light/dark themes, and brighten default node fills for better visibility.
- 816b344: Replace `--docs` and `--beautify` flags with unified `--format` option on `treck show`. Supports `mermaid` (default), `markdown`, `json`, and `ascii` formats. The new `json` format outputs structured graph data for AI agents.
- 384354d: Add AI chat to website showcases. Extracts shared chat helper functions into `src/graph/chat-helpers.ts`, adds a Vercel serverless endpoint to the Astro website, and threads the project slug through the component tree so the showcase chat loads the correct graph.
- 3378334: Split grab-bag modules into focused, single-responsibility files and fix dependency inversions
- e9368a8: Split setup conductor command into its own script like we do for run
- d7d722d: Add subtle button variant and reposition layout button. Refactor chat and recenter buttons to use Button component with consistent styling.
- d2cd639: Update README with missing `show` and `jsdoc` commands, add `--focus` option to `serve` docs, fix Contributing section to use pnpm, and add "View all commands" link to website landing page

## 0.2.3

### Patch Changes

- 91142a3: Add vitest config to exclude .claude worktree directories from test discovery
- 72841f7: Fix linting issues across codebase
- cff5a20: Remove unused `outputDir` parameter from `scanProject` and `scanProjectAsync`

## 0.2.2

### Patch Changes

- a2060b2: Rename project from piste to treck

## 0.2.1

### Patch Changes

- 2a74df7: rename: wend → treck

## 0.2.0

### Minor Changes

- db67f49: Drop per-symbol markdown file generation entirely. `graph.json` is now the sole output. Markdown rendering is done on-the-fly by the server from graph data instead of from pre-written files on disk. This removes `StaticDocGenerator`, `DocParser`, and the entire `_treck/` directory, and updates the checker and CLI commands to work with graph nodes directly.

### Patch Changes

- 462e6bc: Move badge metadata to YAML frontmatter for structured rendering in viewer
- 4c633b9: Add conditional branching awareness to call graph edges

  Detect if/else, else-if chains, switch/case, ternary, and &&/|| guards during AST extraction. Conditional calls produce `conditional-call` edges with a `conditions` array capturing the full chain of ancestor conditions. The graph viewer includes a toggle to show/hide conditional detail. Smart deduplication merges unconditional + conditional calls and collapses both-branch calls to unconditional.

- 6006e2e: Fix expand/collapse all buttons not working during search and add lucide icons
- 15f3145: Exclude gitignored files from source scanning by using `git ls-files` instead of manual directory walking. Generated code (e.g. Prisma clients) no longer appears in JSDoc coverage reports.
- 3d61e7c: Improve CLI setup and sync behavior for real-world project layouts.

  `treck init` now auto-detects common source directories and suggests matching include patterns. `treck sync` now warns clearly when include patterns match zero files. YAML config parsing is more robust for commented include/exclude lists.

- 8b212b1: Fix parameter table rendering and destructured parameter extraction

  Add CSS rules for table styling in docs viewer, expand destructured object parameters into individual rows instead of single row, and escape pipe characters in markdown table cells to prevent column misalignment with union types.

- eca2a3a: Fix docs viewer not loading content when clicking tree items
- 4f15a05: Add graph-based flow visualisation with interactive viewer, config scope filtering, and auto-retry server port
- d6a3a25: Enhance graph viewer with snap-to-grid layout, interactive layout settings, node type filtering, bidirectional highlighting, and loading spinner. Fix trigger.dev matcher for TypeScript generics and TypeScript extractor for call expression initializers. Update CLI hints to reference sync command.
- 02f7b7d: Improve contrast of subgraph headers and edge labels in mermaid diagrams by adjusting CSS custom properties for better legibility
- fcf911e: Add treck jsdoc command and missing-JSDoc viewer banner

  Introduces a new `treck jsdoc` CLI command with `--run`, `--prompt`, and `--verbose` modes to help surface and fix missing JSDoc comments. Extracts `renderMissingJsDocList` helper for reuse across commands, updates the status outro logic to distinguish between doc and JSDoc coverage, and moves missing-JSDoc warnings from static generated markdown to the viewer UI via a new `MissingJsDocBanner` component with inline agent prompt guidance.

- 88b982d: Add JSDoc coverage stats to CLI and docs viewer

  Thread `hasJsDoc` flag through the data layer (GraphNode, ProjectScan, frontmatter, DocParser, SymbolEntry) to surface JSDoc coverage as a first-class metric. The `status` command now shows a JSDoc coverage bar, the `sync` command includes a JSDoc summary line, generated markdown shows a warning for undocumented symbols, and the docs viewer displays indicators in the sidebar tree and graph nodes.

- 906aab1: Show all available agent options in the JSDoc command outro message.
- d2c569d: Improve init wizard for monorepos: auto-detect workspace packages from pnpm-workspace.yaml and package.json workspaces, use multiselect checkboxes for include/exclude patterns, and expand default excludes for common monorepo conventions
- 22dacc7: Add multi-node selection to graph view with URL state persistence and --focus CLI option
- 53e78ea: Change grid size to 8 and snap ceil to 16 so centered items align to the grid
- 8498c3f: Strip quotes from YAML config values to support both quoted and unquoted glob patterns
- 309be65: Complete TSDoc coverage and expand documentation scope

  Add TSDoc comments to all remaining undocumented functions, classes, and constants across the codebase. Include scripts directory in documentation scope to generate docs for utility scripts. Update CLAUDE.md with TSDoc requirements for all new functions and classes.

- 30f4f0e: Unify sidebar across graph and docs views: bring docs into React SPA with react-router, add persistent sidebar navigation, use portal pattern for graph controls, add lucide icons to nav
- bda49f0: Unify sidebar to show same content on graph and docs views, with synced filtering
- 9ce44cf: Update README to reflect static analysis architecture

## 0.1.2

### Patch Changes

- a15e185: Clarify README for end-users vs contributors, add missing command docs, restrict AI provider to Anthropic only

## 0.1.1

### Patch Changes

- 02f1ece: Fix release workflow build failing by separating build and publish steps

## 0.1.0

### Minor Changes

- 924d444: Add AI-powered runtime connection discovery (--discover) and cross-file depth traversal (--depth)

  New --discover flag uses AI to find runtime dispatch connections (e.g. tasks.trigger("task-id")) that static analysis can't see, verifies them against the codebase, and includes them in generated docs with mermaid diagrams. New --depth flag follows function calls across files and generates docs for each callee. Also makes isDocUpToDate check all dependency hashes so docs are correctly flagged stale when any dependency changes.

### Patch Changes

- 0259776: Add changeset infrastructure and version tracking in generated docs
- 441ae47: Enable automatic npm publishing when changesets release PR is merged
- 8c5087d: Fix status command spinner by using async file I/O and yielding during symbol extraction so the loading animation stays smooth
- 9f86a7f: Fix symbol overcounting by excluding dot-directories and common build output directories from source file discovery
- 87f178b: Auto-expand Visual Flow section in serve viewer and show treck version and generated timestamp in doc metadata
