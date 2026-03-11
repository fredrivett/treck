/**
 * Shared hook for node selection state backed by URL search params.
 *
 * Owns the `selected` and `focused` URL params as source of truth.
 * Provides select, toggle, focus, and clear operations used by both
 * FlowGraph (graph node clicks) and ActiveChat (chat badge clicks).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

/** Parse a comma-separated, URL-encoded param into a Set. */
function parseParamSet(value: string | null): Set<string> {
  return value ? new Set(value.split(',').map(decodeURIComponent)) : new Set<string>();
}

/** Encode a Set into a comma-separated, URL-encoded string. */
function encodeParamSet(set: Set<string>): string {
  return [...set].map(encodeURIComponent).join(',');
}

/** Whether two sets contain the same values. */
function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

/** Return value from the useNodeSelection hook. */
export interface NodeSelection {
  /** Currently selected node IDs. */
  selected: Set<string>;
  /** Currently focused node IDs (determines visible subgraph). */
  focused: Set<string>;
  /** Set selected entries directly. */
  setSelected: (entries: Set<string>) => void;
  /** Set focused entries directly. */
  setFocused: (entries: Set<string>) => void;
  /**
   * Handle a node click with optional multi-select support.
   *
   * - Normal click: selects just that node (or deselects if already the only selection).
   * - Cmd/Ctrl+click: toggles the node in/out of the current selection without changing focus.
   */
  clickNode: (nodeId: string, event: React.MouseEvent) => void;
  /** Select one or more nodes, replacing the current selection. Also sets focus. */
  selectNodes: (nodeIds: string[]) => void;
  /** Clear both selection and focus. */
  clear: () => void;
}

/**
 * Hook for managing node selection and focus state.
 *
 * State is kept in React state (for synchronous access during rendering)
 * and synced bidirectionally with URL search params (for deep linking and
 * cross-component communication).
 */
export function useNodeSelection(): NodeSelection {
  const [searchParams, setSearchParams] = useSearchParams();

  const [selected, setSelectedState] = useState<Set<string>>(() =>
    parseParamSet(searchParams.get('selected')),
  );
  const [focused, setFocusedState] = useState<Set<string>>(() =>
    parseParamSet(searchParams.get('focused')),
  );

  // Refs for comparing against URL changes without triggering loops
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  // Sync state → URL params
  useEffect(() => {
    setSearchParams((prev) => {
      if (selected.size > 0) {
        prev.set('selected', encodeParamSet(selected));
      } else {
        prev.delete('selected');
      }
      if (focused.size > 0) {
        prev.set('focused', encodeParamSet(focused));
      } else {
        prev.delete('focused');
        prev.delete('focusDepth');
      }
      return prev;
    });
  }, [selected, focused, setSearchParams]);

  // Sync URL params → state (for external updates, e.g. chat badge clicks)
  useEffect(() => {
    const urlSelected = parseParamSet(searchParams.get('selected'));
    const urlFocused = parseParamSet(searchParams.get('focused'));

    if (!setsEqual(urlSelected, selectedRef.current)) {
      setSelectedState(urlSelected);
    }
    if (!setsEqual(urlFocused, focusedRef.current)) {
      setFocusedState(urlFocused);
    }
  }, [searchParams]);

  const setSelected = useCallback((entries: Set<string>) => {
    setSelectedState(entries);
  }, []);

  const setFocused = useCallback((entries: Set<string>) => {
    setFocusedState(entries);
  }, []);

  const clickNode = useCallback((nodeId: string, event: React.MouseEvent) => {
    const isMultiSelect = event.metaKey || event.ctrlKey;

    if (isMultiSelect) {
      setSelectedState((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });
    } else {
      setSelectedState((prev) => {
        if (prev.size === 1 && prev.has(nodeId)) {
          setFocusedState(new Set());
          return new Set();
        }
        const next = new Set([nodeId]);
        setFocusedState(next);
        return next;
      });
    }
  }, []);

  const selectNodes = useCallback((nodeIds: string[]) => {
    if (nodeIds.length === 0) return;
    const next = new Set(nodeIds);
    setSelectedState(next);
    setFocusedState(next);
  }, []);

  const clear = useCallback(() => {
    setSelectedState(new Set());
    setFocusedState(new Set());
  }, []);

  return { selected, focused, setSelected, setFocused, clickNode, selectNodes, clear };
}
