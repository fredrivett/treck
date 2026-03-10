---
"@treck/website": patch
---

Fix chat message content overflowing container horizontally. Adds `min-w-0` to prevent flexbox overflow and caps heading top margins to 1em. Also reduces heading font sizes: h1-h2 slightly bigger, h3-h6 at base prose-sm size.
