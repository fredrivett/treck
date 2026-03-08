---
"treck": patch
---

Add ASCII output format and theme detection to `treck diff` and `treck show`. Includes dark/light terminal auto-detection, custom `--theme` override, and shape-based diff highlighting (subroutine ([[]] for modified, hexagon {{}} for added, asymmetric >] for entry points) for ASCII rendering. Adds progressive depth fallback to prevent OOM on large graphs.
