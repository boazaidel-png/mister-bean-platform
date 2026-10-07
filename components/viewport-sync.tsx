"use client";

import { useEffect } from "react";

/**
 * Publishes how much of the bottom of the screen the on-screen keyboard
 * covers (--vv-bottom) and the visible area's offset (--vv-top). Phones lay
 * the keyboard over the page without shrinking it, which hid the save buttons
 * of bottom-sheet dialogs. Only the keyboard is measured: browser toolbars
 * appearing and hiding already resize the page, so dialogs otherwise just
 * fill the screen.
 */
export function ViewportSync() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const sync = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      root.style.setProperty("--vv-top", `${Math.max(0, Math.round(viewport.offsetTop))}px`);
      root.style.setProperty("--vv-bottom", `${covered > 1 ? Math.round(covered) : 0}px`);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);
  return null;
}
