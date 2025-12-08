// src/state/usePlayerProgress.js
import { useCallback, useEffect, useState } from "react";
import { loadProgress, saveProgress as saveProgressRaw, clearProgress as clearProgressRaw } from "./playerProgress.js";

/**
 * usePlayerProgress()
 *
 * Returns:
 *  - progress: current persisted progress object (or null)
 *  - saveProgress(partial) => merged progress
 *  - clearProgress() => void
 *
 * The hook listens to window 'rpg.progress.updated' events and updates state.
 */
export default function usePlayerProgress() {
  const [progress, setProgress] = useState(() => loadProgress());

  useEffect(() => {
    function onUpdate(e) {
      // Event detail contains merged progress (or null)
      setProgress(e?.detail ?? null);
    }
    window.addEventListener("rpg.progress.updated", onUpdate);

    // Also handle external storage changes (other tabs)
    function onStorage(e) {
      if (e.key === null || e.key === "rpg.progress.v1") {
        // Reload full progress
        setProgress(loadProgress());
      }
    }
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("rpg.progress.updated", onUpdate);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const saveProgress = useCallback((partial = {}) => {
    const merged = saveProgressRaw(partial);
    // saveProgressRaw already emits event; setProgress will be triggered by event,
    // but update local state immediately for optimistic UI and to avoid rare races.
    if (merged) setProgress(merged);
    return merged;
  }, []);

  const clearProgress = useCallback(() => {
    clearProgressRaw();
    // Immediately reflect cleared state locally (event will also arrive).
    setProgress(null);
  }, []);

  return { progress, saveProgress, clearProgress };
}
