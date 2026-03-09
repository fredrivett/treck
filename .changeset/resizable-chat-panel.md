---
"treck": patch
---

Use collapsible chat panel to prevent sidebar width shift when toggling chat visibility. Instead of conditionally mounting/unmounting the chat panel (which caused proportional resizing of other panels), the panel is now always mounted and collapsed/expanded imperatively.
