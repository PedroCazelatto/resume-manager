"use client";

import { useLayoutEffect } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { resolveTheme, THEME_KEY, type Theme } from "@/lib/theme";

function storedChoice(): string | null {
  try {
    return window.localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

/** Switches between light and dark; until it is used the app follows the system setting (F34). */
export function ThemeToggle() {
  // The inline script in the layout sets the mode before paint. This keeps following the
  // system while no choice is stored, and re-applies the class after React's dev remount.
  useLayoutEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => apply(resolveTheme(storedChoice(), system.matches));
    sync();
    system.addEventListener("change", sync);
    return () => system.removeEventListener("change", sync);
  }, []);

  function toggle() {
    const next: Theme = document.documentElement.classList.contains("dark") ? "light" : "dark";
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Without local storage the choice lasts until the next page load.
    }
    apply(next);
  }

  return (
    <Button variant="ghost" size="icon" aria-label="Switch between light and dark mode" onClick={toggle}>
      <Icon name="moon" className="dark:hidden" />
      <Icon name="sun" className="hidden dark:block" />
    </Button>
  );
}
