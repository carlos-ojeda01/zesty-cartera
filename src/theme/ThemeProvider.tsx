import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { themes, type Mode, type Theme } from './tokens';

/** 'system' sigue al sistema operativo; los otros dos fuerzan el tema. */
export type ThemePref = 'system' | Mode;

const STORAGE_KEY = 'zesty.theme';

interface ThemeContextValue {
  theme: Theme;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  // Claro por defecto: es un tablero para mirar de día, en el PC.
  const [pref, setPrefState] = useState<ThemePref>('light');

  useEffect(() => {
    // La lectura es asíncrona, así que el primer render usa el tema del
    // sistema y luego se corrige. Es un parpadeo de un frame, aceptable.
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPrefState(stored);
        }
      })
      .catch(() => {
        // Sin almacenamiento (modo incógnito, por ejemplo): se queda en 'system'.
      });
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const mode: Mode = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
    return { theme: themes[mode], pref, setPref };
  }, [pref, system, setPref]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx.theme;
}

export function useThemePref() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePref debe usarse dentro de <ThemeProvider>');
  return { pref: ctx.pref, setPref: ctx.setPref, mode: ctx.theme.mode };
}
