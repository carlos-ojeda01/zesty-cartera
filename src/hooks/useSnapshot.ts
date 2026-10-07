import { useCallback, useEffect, useRef, useState } from 'react';

import type { Balance, CashMovement, Snapshot } from '@/lib/finance';

export interface SyncInfo {
  source: string;
  ran_at: string;
  status: string;
}

export interface FullSnapshot extends Snapshot {
  /** La cartera ficticia de `ejemplo/` (npm run demo). */
  demo: boolean;
  balances: Balance[];
  cashMovements: CashMovement[];
  lastSync: SyncInfo | null;
  /**
   * La última corrida de cada origen, por separado.
   *
   * `yahoo` son los precios y los refresca `npm run precios` (o el propio
   * `npm run dashboard` cada 15 minutos); `zesty` es la cartera —posiciones,
   * saldos y operaciones— y solo entra por el MCP, desde una sesión del agente.
   * Mezclarlos en una sola fecha haría que unos precios de hace un minuto
   * taparan una cartera de hace tres días.
   */
  syncs: Record<string, SyncInfo>;
}

interface State {
  data: FullSnapshot | null;
  loading: boolean;
  /** Hay una relectura en vuelo, con datos ya en pantalla. */
  refreshing: boolean;
  error: string | null;
}

/**
 * De dónde se lee el tablero.
 *
 * `scripts/snapshot.mjs` lo escribe en `public/data/snapshot.json` (fuera de
 * git) y el servidor de Expo lo sirve como archivo estático. No hay base de
 * datos ni backend: todo queda en tu computador.
 */
const SNAPSHOT_URL = process.env.EXPO_PUBLIC_SNAPSHOT_URL ?? '/data/snapshot.json';

/** Mensaje cuando todavía no hay datos: dice exactamente qué hacer. */
export const SIN_DATOS =
  'Todavía no hay datos. Pídele a tu agente «sincroniza mi cartera de Zesty» ' +
  '(o corre `npm run demo` para ver el tablero con una cartera ficticia).';

/**
 * El último tablero leído, guardado en memoria mientras la app esté abierta,
 * para que al volver a la pantalla aparezca al tiro con lo último conocido.
 */
let cached: FullSnapshot | null = null;

/**
 * Trae todo el estado del dashboard en una sola lectura.
 *
 * Los números se convierten explícitamente: si algún día el archivo trae un
 * monto como texto, las sumas terminarían concatenando y el bug sería
 * silencioso y desconcertante.
 */
export function useSnapshot() {
  const [state, setState] = useState<State>({
    data: cached,
    loading: cached === null,
    refreshing: false,
    error: null,
  });

  useEffect(() => {
    if (state.data) cached = state.data;
  }, [state.data]);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: s.data === null, refreshing: s.data !== null, error: null }));

    try {
      // Con `?t=` y no-store para que el navegador no sirva una copia vieja:
      // el archivo se reescribe cada vez que corren los precios o la sincronización.
      const res = await fetch(`${SNAPSHOT_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.status === 404) throw new Error(SIN_DATOS);
      if (!res.ok) throw new Error(`No se pudo leer ${SNAPSHOT_URL} (HTTP ${res.status}).`);
      const text = await res.text();
      // El servidor de desarrollo responde con el HTML de la app cuando el
      // archivo no existe, en vez de un 404.
      if (text.trimStart().startsWith('<')) throw new Error(SIN_DATOS);
      const data = coerce(JSON.parse(text));
      if (alive.current) setState({ data, loading: false, refreshing: false, error: null });
    } catch (e) {
      if (!alive.current) return;
      const message = e instanceof Error ? e.message : String(e);
      // Si ya había datos en pantalla, un fallo al releer no los borra.
      setState((s) =>
        s.data
          ? { ...s, loading: false, refreshing: false }
          : { data: null, loading: false, refreshing: false, error: message },
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

type RawSnapshot = Record<string, unknown[]> & { lastSync: unknown; syncs: unknown };

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

function coerce(raw: RawSnapshot): FullSnapshot {
  const rows = <T>(key: string): T[] => (Array.isArray(raw?.[key]) ? (raw[key] as T[]) : []);

  return {
    demo: (raw as { demo?: unknown })?.demo === true,
    assets: rows<FullSnapshot['assets'][number]>('assets'),

    trades: rows<Record<string, unknown>>('trades').map((t) => ({
      id: String(t.id),
      source: t.source === 'externa' ? 'externa' : 'zesty',
      symbol: String(t.symbol),
      market: t.market as 'cl' | 'us',
      side: t.side as 'buy' | 'sell',
      executed_at: String(t.executed_at),
      qty: num(t.qty),
      price: num(t.price),
      gross_amount: num(t.gross_amount),
      commission: num(t.commission),
      vat: num(t.vat),
      net_amount: num(t.net_amount),
      currency: t.currency as 'CLP' | 'USD',
      note: (t.note as string | null) ?? null,
    })),

    prices: rows<Record<string, unknown>>('prices').map((p) => ({
      yahoo_ticker: String(p.yahoo_ticker),
      price_date: String(p.price_date),
      close: num(p.close),
      adj_close: numOrNull(p.adj_close),
      low: numOrNull(p.low),
      high: numOrNull(p.high),
      source: (p.source as 'yahoo' | 'zesty' | undefined) ?? 'yahoo',
    })),

    dividends: rows<Record<string, unknown>>('dividends').map((d) => ({
      id: String(d.id),
      symbol: String(d.symbol),
      market: d.market as 'cl' | 'us',
      paid_at: String(d.paid_at),
      amount: num(d.amount),
      currency: d.currency as 'CLP' | 'USD',
    })),

    benchmarkDividends: rows<Record<string, unknown>>('benchmarkDividends').map((b) => ({
      ex_date: String(b.ex_date),
      amount_per_unit: num(b.amount_per_unit),
    })),

    fxTrades: rows<Record<string, unknown>>('fxTrades').map((f) => ({
      id: String(f.id),
      side: f.side as 'buy' | 'sell',
      executed_at: String(f.executed_at),
      clp_amount: num(f.clp_amount),
      usd_amount: num(f.usd_amount),
      rate: num(f.rate),
      spot_rate: numOrNull(f.spot_rate),
    })),

    positions: rows<Record<string, unknown>>('positions').map((p) => ({
      symbol: String(p.symbol),
      market: p.market as 'cl' | 'us',
      qty: num(p.qty),
      avg_price: num(p.avg_price),
      current_price: numOrNull(p.current_price),
      market_value: numOrNull(p.market_value),
      cost_basis: numOrNull(p.cost_basis),
      unrealized_pl: numOrNull(p.unrealized_pl),
      currency: p.currency as 'CLP' | 'USD',
    })),

    balances: rows<Record<string, unknown>>('balances').map((b) => ({
      market: b.market as 'cl' | 'us',
      cash: num(b.cash),
      buying_power: numOrNull(b.buying_power),
      investments: numOrNull(b.investments),
      pending_settlement: num(b.pending_settlement),
    })),

    cashMovements: rows<Record<string, unknown>>('cashMovements').map((c) => ({
      id: String(c.id),
      kind: c.kind as 'deposit' | 'withdrawal',
      occurred_at: String(c.occurred_at),
      amount: num(c.amount),
      currency: String(c.currency),
    })),

    lastSync: (raw?.lastSync as FullSnapshot['lastSync']) ?? null,

    // Los snapshots viejos (y el fixture de previsualización) no traen `syncs`;
    // se reconstruye desde `lastSync` para que la interfaz no tenga que
    // preguntarse si el campo existe.
    syncs:
      (raw?.syncs as FullSnapshot['syncs'] | undefined) ??
      (raw?.lastSync
        ? { [(raw.lastSync as SyncInfo).source]: raw.lastSync as SyncInfo }
        : {}),
  };
}
