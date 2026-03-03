---
"treck": patch
---

Merge edge conditions instead of silently dropping duplicate calls. When the same function is called multiple times conditionally, labels are now combined as `(A) or (B)` rather than keeping only the first condition.
