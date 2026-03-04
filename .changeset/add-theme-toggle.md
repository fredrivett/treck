---
"treck": patch
"@treck/website": patch
---

Improve component node color legibility in dark mode and add theme toggle to viewer and website. Adds light/dark/auto theme toggle adapted from abode project. Theme preference persists in localStorage with inline script to prevent FOUC. FlowGraph detects dark mode reactively via MutationObserver. All marketing pages and showcase viewer now use theme-aware Tailwind classes. Component nodes now use orange-900/20 background in dark mode for better legibility instead of orange-950.
