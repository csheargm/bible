import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { 
  Season, SeasonTheme, getSeasonTheme, applyThemeToDOM, 
  saveSeasonOverride, getSavedSeasonOverride, getThemeForSeason, getSeason 
} from '../services/seasonTheme';

interface SeasonThemeContextValue {
  theme: SeasonTheme;
  isAuto: boolean;           // true = auto-detecting season
  setSeason: (season: Season | null) => void;  // null = back to auto
}

const defaultCtx: SeasonThemeContextValue = {
  theme: getSeasonTheme(),
  isAuto: getSavedSeasonOverride() === null,
  setSeason: () => {},
};

const SeasonThemeContext = createContext<SeasonThemeContextValue>(defaultCtx);

export const SeasonThemeProvider = SeasonThemeContext.Provider;

/**
 * Use in any child component to access the theme + change it.
 */
export function useSeasonTheme(): SeasonThemeContextValue {
  return useContext(SeasonThemeContext);
}

/**
 * Root-level hook — initializes theme, applies CSS vars, and returns controls.
 * Call once in App.tsx.
 */
export function useSeasonThemeInit(): SeasonThemeContextValue {
  const [theme, setTheme] = useState<SeasonTheme>(() => getSeasonTheme());
  const [isAuto, setIsAuto] = useState<boolean>(() => getSavedSeasonOverride() === null);

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  const setSeason = useCallback((season: Season | null) => {
    saveSeasonOverride(season);
    if (season === null) {
      // Revert to auto
      setIsAuto(true);
      setTheme(getThemeForSeason(getSeason()));
    } else {
      setIsAuto(false);
      setTheme(getThemeForSeason(season));
    }
  }, []);

  return { theme, isAuto, setSeason };
}
