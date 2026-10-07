import type { PriceRow, Trade } from './types';

export const dayOf = (iso: string) => iso.slice(0, 10);

/**
 * Eje de fechas del gráfico.
 *
 * Se usa la unión de los días en que hubo precio para CUALQUIER ticker, no la
 * intersección: la Bolsa de Santiago, Nasdaq y el mercado cambiario tienen
 * feriados distintos, y una intersección borraría días perfectamente válidos.
 * Los huecos por ticker se rellenan después arrastrando el último precio.
 */
export function buildDateAxis(prices: PriceRow[], from: string, to?: string): string[] {
  const set = new Set<string>();
  for (const p of prices) {
    if (p.price_date < from) continue;
    if (to && p.price_date > to) continue;
    set.add(p.price_date);
  }
  return [...set].sort();
}

/**
 * Precios por ticker y fecha, rellenados hacia adelante sobre el eje dado.
 *
 * Si un ticker no transó un día (feriado local, suspensión, baja liquidez) se
 * arrastra su último cierre conocido en vez de valorizar en cero.
 */
export function buildPriceIndex(
  prices: PriceRow[],
  dates: string[],
): Map<string, Map<string, number>> {
  const byTicker = new Map<string, Map<string, number>>();
  for (const p of prices) {
    let m = byTicker.get(p.yahoo_ticker);
    if (!m) byTicker.set(p.yahoo_ticker, (m = new Map()));
    m.set(p.price_date, p.close);
  }

  const out = new Map<string, Map<string, number>>();
  for (const [ticker, raw] of byTicker) {
    const filled = new Map<string, number>();
    let last: number | null = null;
    for (const d of dates) {
      const v = raw.get(d);
      if (v !== undefined) last = v;
      if (last !== null) filled.set(d, last);
    }
    out.set(ticker, filled);
  }
  return out;
}

/**
 * Tenencia de cada símbolo al cierre de cada fecha del eje.
 *
 * Recorre el libro de operaciones una sola vez en orden cronológico y va
 * fotografiando el estado en cada fecha. Las operaciones externas y las de Zesty
 * viven en la misma tabla, así que la reconstrucción atraviesa el traspaso de
 * corredora sin costuras.
 */
export function buildDailyHoldings(
  trades: Trade[],
  dates: string[],
): Map<string, Map<string, number>> {
  const sorted = [...trades].sort((a, b) => a.executed_at.localeCompare(b.executed_at));
  const running = new Map<string, number>();
  const out = new Map<string, Map<string, number>>();

  let i = 0;
  for (const date of dates) {
    while (i < sorted.length && dayOf(sorted[i].executed_at) <= date) {
      const t = sorted[i];
      const delta = t.side === 'buy' ? t.qty : -t.qty;
      const next = (running.get(t.symbol) ?? 0) + delta;
      // Redondeo defensivo: sumar y restar decimales de acciones fraccionadas
      // deja residuos del orden de 1e-12 que ensucian los cero.
      running.set(t.symbol, Math.abs(next) < 1e-9 ? 0 : next);
      i++;
    }
    out.set(date, new Map(running));
  }

  return out;
}

/** Primera fecha con actividad. El gráfico no debería empezar antes. */
export function firstTradeDate(trades: Trade[]): string | null {
  if (trades.length === 0) return null;
  return trades.reduce(
    (min, t) => (dayOf(t.executed_at) < min ? dayOf(t.executed_at) : min),
    dayOf(trades[0].executed_at),
  );
}
