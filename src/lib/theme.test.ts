import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_KEY, THEME_SCRIPT } from "./theme";

describe("resolveTheme", () => {
  it("follows the system setting until a choice is stored", () => {
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme(null, true)).toBe("dark");
  });

  it("lets the stored choice win over the system setting", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("ignores a stored value that is not a mode", () => {
    expect(resolveTheme("blue", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("THEME_SCRIPT", () => {
  /** Runs the inline script against a fake browser and returns whether it set the dark class. */
  function run(stored: string | null | Error, systemDark: boolean): boolean {
    let dark: boolean | null = null;
    const localStorage = {
      getItem(key: string) {
        if (stored instanceof Error) throw stored;
        return key === THEME_KEY ? stored : null;
      },
    };
    const matchMedia = (query: string) => ({ matches: query === "(prefers-color-scheme: dark)" && systemDark });
    const document = {
      documentElement: {
        classList: {
          toggle(name: string, force: boolean) {
            if (name === "dark") dark = force;
          },
        },
      },
    };
    new Function("localStorage", "matchMedia", "document", THEME_SCRIPT)(localStorage, matchMedia, document);
    if (dark === null) throw new Error("The script did not set the mode.");
    return dark;
  }

  it("agrees with resolveTheme for every stored value and system setting", () => {
    for (const stored of [null, "light", "dark", "blue"]) {
      for (const systemDark of [false, true]) {
        expect(run(stored, systemDark)).toBe(resolveTheme(stored, systemDark) === "dark");
      }
    }
  });

  it("follows the system setting when local storage is unavailable", () => {
    expect(run(new Error("blocked"), true)).toBe(true);
    expect(run(new Error("blocked"), false)).toBe(false);
  });
});
