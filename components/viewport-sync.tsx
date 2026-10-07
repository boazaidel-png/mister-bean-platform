"use client";

import { useEffect } from "react";

/**
 * Publishes the visible area of the screen as CSS variables (--vv-top,
 * --vv-height). On phones the on-screen keyboard covers the bottom of the
 * page without shrinking it, which hid the save buttons of bottom-sheet
 * dialogs; the dialogs size themselves to this visible area instead.
 */
export function ViewportSync() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--vv-top", `${Math.round(viewport.offsetTop)}px`);
      root.style.setProperty("--vv-height", `${Math.round(viewport.height)}px`);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
    };
  }, []);
  return null;
}
