import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { BenchmarkKey, Period } from '@/lib/finance';

const KEY = 'zesty.prefs';

interface Prefs {
  /**
   * Contra qué índice se compara la cartera.
   *
   * Viene encendido en IPSA: un patrimonio que sube un 14% no dice nada hasta
   * que se sabe cuánto subió el mercado en el mismo período. Dejarlo apagado
   * por defecto convertía la comparación en una función escondida.
   */
  benchmark: BenchmarkKey;
  /** 'real' descuenta el spread de venta del dólar; 'nominal' usa el mid. */
  usdMode: 'real' | 'nominal';
  period: Period;
}

const DEFAULTS: Prefs = { benchmark: 'ipsa', usdMode: 'real', period: '6M' };

interface Ctx extends Prefs {
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
}

const PreferencesContext = createContext<Ctx | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) });
        } catch {
          // Preferencias corruptas: se ignoran y quedan los valores por defecto.
        }
      })
      .catch(() => {});
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...prefs,
      set: (key, v) => {
        setPrefs((prev) => {
          const next = { ...prev, [key]: v };
          AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      },
    }),
    [prefs],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): Ctx {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences debe usarse dentro de <PreferencesProvider>');
  return ctx;
}
