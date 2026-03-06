---
'treck': patch
---

Add AI chat to website showcases. Extracts shared chat helper functions into `src/graph/chat-helpers.ts`, adds a Vercel serverless endpoint to the Astro website, and threads the project slug through the component tree so the showcase chat loads the correct graph.
