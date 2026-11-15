export type Theme = "light" | "dark";

/** The local storage key holding the mode chosen with the toggle (F34). */
export const THEME_KEY = "theme";

/** The stored choice wins; without a valid one the app follows the system setting. */
export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemDark ? "dark" : "light";
}

/**
 * Runs inline in <head>, before the first paint, so the page never shows the wrong
 * mode. It is `resolveTheme` written out by hand, because it runs before any module loads.
 */
export const THEME_SCRIPT = `(function(){var s=null;try{s=localStorage.getItem("${THEME_KEY}")}catch(e){}var d=s==="dark"||(s!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)})()`;
