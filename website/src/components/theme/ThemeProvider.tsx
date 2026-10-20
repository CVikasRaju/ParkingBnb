"use client";

import { createContext, useContext, useState, useTransition } from "react";

export type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

export const THEME_EVENT = "parkpeer-theme-change";

function applyThemeToDocument(next: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
  root.setAttribute("data-theme", next);
  root.style.colorScheme = next;

  // Dispatch event so map canvas can update style immediately
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme: next } }));
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("parkpeer-theme") as Theme | null;
        if (saved === "light" || saved === "dark") return saved;
        if (document.documentElement.classList.contains("light")) return "light";
      } catch {
        // ignore
      }
    }
    return "dark";
  });

  const [, startTransition] = useTransition();

  function setTheme(next: Theme) {
    startTransition(() => {
      setThemeState(next);
      try {
        localStorage.setItem("parkpeer-theme", next);
      } catch {
        // ignore
      }
      applyThemeToDocument(next);
    });
  }

  function toggleTheme() {
    setTheme(theme === "dark" ? "light" : "dark");
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
