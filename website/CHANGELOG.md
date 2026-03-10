# @treck/website

## 0.0.3

### Patch Changes

- 6fadc1e: Fix TooltipProvider context error in showcase viewer by wrapping GraphExplorer with TooltipProvider

## 0.0.2

### Patch Changes

- c29c183: Improve component node color legibility in dark mode and add theme toggle to viewer and website. Adds light/dark/auto theme toggle adapted from abode project. Theme preference persists in localStorage with inline script to prevent FOUC. FlowGraph detects dark mode reactively via MutationObserver. All marketing pages and showcase viewer now use theme-aware Tailwind classes. Component nodes now use orange-900/20 background in dark mode for better legibility instead of orange-950.
- f61e936: Automate showcase graph regeneration. Treck self-graph now regenerates on every website build via a prebuild script. External showcases (tldraw) regenerate daily via GitHub Actions and auto-commit to main.
- 5d9673a: Add copy-to-clipboard button on install command with lucide icons, and include website dev server in run script
- 7118c45: Fixed chat API endpoint failing on Vercel by reading graph JSON from filesystem instead of self-fetching. Added `includeFiles` config to bundle showcase JSON files into the serverless function, and implemented path fallback for local dev vs production environments.
- 393049d: Update website navbar: use icon links for npm and GitHub, add reusable Nav component, update favicon to black background, and add showcases link to homepage nav.
