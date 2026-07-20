import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, toggleTheme, type Theme } from "../theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function switchTheme() {
    setTheme((current: Theme) => toggleTheme(current));
  }

  return { theme, switchTheme, isDark: theme === "dark" };
}
