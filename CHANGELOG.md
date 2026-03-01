# treck

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
