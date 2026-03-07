---
"@treck/website": patch
---

Fixed chat API endpoint failing on Vercel by reading graph JSON from filesystem instead of self-fetching. Added `includeFiles` config to bundle showcase JSON files into the serverless function, and implemented path fallback for local dev vs production environments.
