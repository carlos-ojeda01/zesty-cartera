import type { Dividend, Position, Trade } from './types';

/**
 * Rentabilidad por dividendo, desglosada por acción.
 *
 * Esto es lo que la app de Zesty no muestra: su P&L es solo precio contra
 * precio de compra, así que un papel que reparte mucho aparece peor de lo que
 * es. En esta cartera el efecto es grande — Quiñenco lleva más rentabilidad en
 * dividendos que en precio.
 */
export interface DividendStats {
  symbol: string;
  /** Total cobrado desde la primera compra. */
  collected: number;
  /** Cobrado en los últimos 12 meses. */
  lastTwelveMonths: number;
  /** Dividendos sobre el costo de adquisición. La medida que importa. */
  yieldOnCost: number | null;
  /** Últimos 12 meses sobre el valor de mercado actual. Comparable con el mercado. */
  currentYield: number | null;
  /** Retorno de la posición contando solo el precio. */
  capitalReturn: number | null;
  /** Retorno total: precio más dividendos. */
  totalReturn: number | null;
  /** Qué fracción del retorno total vino del dividendo. */
  dividendShareOfReturn: number | null;
}

export function dividendStats(params: {
  positions: Position[];
  dividends: Dividend[];
  trades: Trade[];
  /** Fecha de corte para la ventana de 12 meses. Por defecto, hoy. */
  asOf?: string;
}): DividendStats[] {
  const { positions, dividends, trades } = params;
  const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);

  const cutoff = new Date(asOf + 'T00:00:00Z');
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const bySymbol = new Map<string, { total: number; ltm: number }>();
  for (const d of dividends) {
    const entry = bySymbol.get(d.symbol) ?? { total: 0, ltm: 0 };
    entry.total += d.amount;
    if (d.paid_at >= cutoffDate) entry.ltm += d.amount;
    bySymbol.set(d.symbol, entry);
  }

  // Símbolos con dividendos pero ya vendidos: igual aportaron al resultado.
  const symbols = new Set<string>([
    ...positions.map((p) => p.symbol),
    ...bySymbol.keys(),
  ]);

  const out: DividendStats[] = [];

  for (const symbol of symbols) {
    const div = bySymbol.get(symbol) ?? { total: 0, ltm: 0 };
    const position = positions.find((p) => p.symbol === symbol);

    const cost =
      position?.cost_basis ??
      trades
        .filter((t) => t.symbol === symbol && t.side === 'buy')
        .reduce((sum, t) => sum + t.gross_amount, 0);

    const marketValue = position?.market_value ?? null;

    const capitalReturn =
      cost > 0 && marketValue !== null ? marketValue / cost - 1 : null;
    const totalReturn =
      cost > 0 && marketValue !== null ? (marketValue + div.total) / cost - 1 : null;

    out.push({
      symbol,
      collected: div.total,
      lastTwelveMonths: div.ltm,
      yieldOnCost: cost > 0 ? div.total / cost : null,
      currentYield: marketValue && marketValue > 0 ? div.ltm / marketValue : null,
      capitalReturn,
      totalReturn,
      // Cuando el precio va perdiendo y el dividendo salva la posición, esta
      // fracción se pasa de 1. Es correcto y vale la pena verlo.
      dividendShareOfReturn:
        totalReturn !== null && totalReturn !== 0 && cost > 0
          ? div.total / cost / totalReturn
          : null,
    });
  }

  return out.sort((a, b) => b.collected - a.collected);
}
