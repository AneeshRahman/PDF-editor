import { useCallback, useSyncExternalStore } from "react";

/**
 * Light/dark theme. Follows the system setting until the user flips the switch, then
 * remembers their choice. index.html applies it before first paint (no flash).
 */
export type Theme = "light" | "dark";

const KEY = "pdf-editor:theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export const currentTheme = (): Theme => stored() ?? (media().matches ? "dark" : "light");

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(fn: () => void) {
  listeners.add(fn);
  // Follow the system while the user hasn't chosen.
  const onSystem = () => {
    if (!stored()) {
      applyTheme(currentTheme());
      fn();
    }
  };
  const mq = media();
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(fn);
    mq.removeEventListener("change", onSystem);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      // storage blocked: still switch for this visit
    }
    applyTheme(t);
    notify();
  }, []);
  return { theme, setTheme };
}
