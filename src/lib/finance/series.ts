import { buildBenchmark, tradesToFlows } from './benchmark';
import { avgAcquiredRate, buildFxIndex, buyRate, sellRate } from './fx';
import { buildDailyHoldings, buildDateAxis, buildPriceIndex, dayOf, firstTradeDate } from './holdings';
import type {
  BenchmarkDividend,
  BenchmarkKey,
  Scope,
  SeriesOptions,
  SeriesPoint,
  Snapshot,
} from './types';

/** Ticker del S&P 500 Total Return en Yahoo. */
export const SP500_TICKER = '^SP500TR';

/** Los índices ofrecidos, con el nombre que ve el usuario. */
export const BENCHMARKS: Record<BenchmarkKey, { label: string; full: string }> = {
  none: { label: 'Ninguno', full: 'sin comparación' },
  ipsa: { label: 'IPSA', full: 'el IPSA chileno' },
  sp500: { label: 'S&P 500', full: 'el S&P 500 (retorno total)' },
};

const inScope = (market: string, scope: Scope) => scope === 'all' || market === scope;

export interface SeriesResult {
  points: SeriesPoint[];
  /** Símbolos que quedaron sin precio y por tanto valorizados a costo. */
  missingPrices: string[];
}

/**
 * Arma las tres series que se dibujan: el portafolio, el benchmark sombra y el
 * capital aportado.
 *
 * Todo se expresa en pesos. Para el tramo en dólares hay dos lecturas y el
 * usuario elige cuál mirar: 'nominal' valoriza al mid de mercado, 'real'
 * descuenta el spread de venta, que es la plata que de verdad llegaría a la
 * cuenta si liquidara hoy.
 */
export function buildSeries(snapshot: Snapshot, options: SeriesOptions): SeriesResult {
  const { scope, usdMode } = options;

  const trades = snapshot.trades.filter((t) => inScope(t.market, scope));
  const start = firstTradeDate(trades);
  if (!start) return { points: [], missingPrices: [] };

  const dates = buildDateAxis(snapshot.prices, start);
  if (dates.length === 0) return { points: [], missingPrices: [] };

  const priceIndex = buildPriceIndex(snapshot.prices, dates);
  const fxIndex = buildFxIndex(snapshot.prices, dates);
  const holdings = buildDailyHoldings(trades, dates);

  // Red de seguridad para fechas sin tipo de cambio (feriados cambiarios que no
  // coinciden con los bursátiles). Valorizar en cero sería mucho peor que
  // arrastrar el valor más cercano disponible.
  const fallbackFx = fxIndex.values().next().value ?? 0;

  const assetBySymbol = new Map(snapshot.assets.map((a) => [a.symbol, a]));

  // Costo promedio por símbolo, para valorizar aquello que no tiene precio.
  const costPerShare = new Map<string, number>();
  for (const t of trades) {
    if (t.side === 'buy' && !costPerShare.has(t.symbol)) {
      costPerShare.set(t.symbol, t.price);
    }
  }

  const missing = new Set<string>();

  /**
   * Eventos fechados que hay que ir acumulando sobre el eje del gráfico.
   *
   * No se pueden indexar por fecha exacta: una operación o un dividendo pueden
   * caer un sábado o un feriado, y ese día no existe en el eje de precios. Con
   * un `Map.get(fecha)` el evento simplemente desaparecería —fue exactamente lo
   * que pasaba con las ventas que Zesty liquida un sábado, que dejaban el
   * capital invertido inflado en el monto de la venta—. Se recorren como una lista
   * ordenada, consumiendo todo lo que quedó atrás en cada paso.
   */
  const collect = <T>(items: T[], date: (x: T) => string, amount: (x: T) => number) =>
    items
      .map((x) => ({ date: date(x), amount: amount(x) }))
      .sort((a, b) => a.date.localeCompare(b.date));

  const investedEvents = collect(
    trades,
    (t) => dayOf(t.executed_at),
    (t) => {
      const date = dayOf(t.executed_at);
      // Para el tramo en dólares se usa la tasa que efectivamente se pagó,
      // no el mid de mercado: los pesos que salieron de la cuenta son los que
      // cuentan como capital aportado.
      const clp =
        t.currency === 'USD'
          ? t.net_amount *
            (avgAcquiredRate(snapshot.fxTrades, date) ?? fxIndex.get(date) ?? fallbackFx)
          : t.net_amount;
      return t.side === 'buy' ? clp : -clp;
    },
  );

  /**
   * El índice elegido, siempre expresado en pesos.
   *
   * El IPSA ya cotiza en pesos. El S&P 500 cotiza en dólares, así que se
   * convierte: se compra al dólar de compra y se valoriza al de venta, que es
   * exactamente lo que la app hace con las posiciones reales en USD. Sin eso,
   * la comparación le regalaría al índice extranjero los $20 por dólar de ida
   * y vuelta que la cartera sí paga.
   */
  const benchmarkSetup = (): {
    valuation: Map<string, number>;
    purchase: Map<string, number>;
    dividends: BenchmarkDividend[];
  } | null => {
    if (options.benchmark === 'none') return null;

    if (options.benchmark === 'ipsa') {
      const asset = snapshot.assets.find((a) => a.is_benchmark);
      const prices = asset ? priceIndex.get(asset.yahoo_ticker) : undefined;
      if (!prices) return null;
      return { valuation: prices, purchase: prices, dividends: snapshot.benchmarkDividends };
    }

    const usd = priceIndex.get(SP500_TICKER);
    if (!usd) return null;

    const valuation = new Map<string, number>();
    const purchase = new Map<string, number>();
    for (const date of dates) {
      const p = usd.get(date);
      if (p === undefined) continue;
      const mid = fxIndex.get(date) ?? fallbackFx;
      valuation.set(date, p * (usdMode === 'real' ? sellRate(mid) : mid));
      purchase.set(date, p * (usdMode === 'real' ? buyRate(mid) : mid));
    }
    // Es un índice de RETORNO TOTAL: ya reinvierte sus propios dividendos.
    return { valuation, purchase, dividends: [] };
  };

  const setup = benchmarkSetup();

  const benchmark = setup
    ? buildBenchmark({
        flows: tradesToFlows(trades, snapshot.fxTrades),
        dates,
        benchmarkPrices: setup.valuation,
        flowPrices: setup.purchase,
        dividends: setup.dividends,
      })
    : null;

  const points: SeriesPoint[] = [];
  let cumulativeInvested = 0;
  let ii = 0;

  for (const date of dates) {
    while (ii < investedEvents.length && investedEvents[ii].date <= date) {
      cumulativeInvested += investedEvents[ii].amount;
      ii++;
    }

    const mid = fxIndex.get(date) ?? fallbackFx;
    const usdFactor = usdMode === 'real' ? sellRate(mid) : mid;

    let portfolio = 0;
    const positionsToday = holdings.get(date);
    if (positionsToday) {
      for (const [symbol, qty] of positionsToday) {
        if (qty === 0) continue;
        const asset = assetBySymbol.get(symbol);
        if (!asset) continue;

        let price = priceIndex.get(asset.yahoo_ticker)?.get(date);
        if (price === undefined) {
          // Sin serie de precios (un ticker que Yahoo no cubre) se
          // valoriza a costo. Es plano, pero es honesto y queda señalado.
          price = costPerShare.get(symbol);
          if (price === undefined) continue;
          missing.add(symbol);
        }

        portfolio += qty * price * (asset.currency === 'USD' ? usdFactor : 1);
      }
    }

    const benchmarkValue =
      benchmark && setup
        ? (benchmark.units.get(date) ?? 0) * (setup.valuation.get(date) ?? 0) +
          (benchmark.cashDividends.get(date) ?? 0)
        : 0;

    points.push({
      date,
      portfolio,
      benchmark: benchmarkValue,
      invested: cumulativeInvested,
    });
  }

  return { points, missingPrices: [...missing] };
}

/** Recorta la serie a una ventana temporal. */
export type Period = '1M' | '3M' | '6M' | '1A' | 'TODO';

export function slicePeriod(points: SeriesPoint[], period: Period): SeriesPoint[] {
  if (period === 'TODO' || points.length === 0) return points;

  const months = { '1M': 1, '3M': 3, '6M': 6, '1A': 12 }[period];
  const last = new Date(points[points.length - 1].date + 'T00:00:00Z');
  last.setUTCMonth(last.getUTCMonth() - months);
  const cutoff = last.toISOString().slice(0, 10);

  const sliced = points.filter((p) => p.date >= cutoff);
  // Con menos de dos puntos no hay línea que dibujar; se devuelve todo.
  return sliced.length >= 2 ? sliced : points;
}
