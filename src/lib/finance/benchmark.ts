import { avgAcquiredRate } from './fx';
import { dayOf } from './holdings';
import type { BenchmarkDividend, FxTrade, Trade } from './types';

/**
 * El portafolio sombra: qué habría pasado si cada peso que pusiste en una
 * acción hubiera ido al ETF del IPSA (CFMITNIPSA) ese mismo día.
 *
 * Es una comparación ponderada por flujos de caja, no por tiempo. Eso es
 * deliberado: castiga o premia el *timing* de cada aporte, que es justamente lo
 * que un TWR esconde. Si compraste caro, el benchmark también compró caro.
 *
 * Las compras en dólares entran por los PESOS que costaron, no por los dólares.
 * Así la pérdida cambiaria queda dentro del alfa, que es donde corresponde: la
 * alternativa real no era "comprar dólares y quedarse", era "no salir de pesos".
 */

export interface BenchmarkState {
  /** Unidades del ETF acumuladas al cierre de cada fecha. */
  units: Map<string, number>;
  /** Dividendos del ETF cobrados en efectivo, acumulados. */
  cashDividends: Map<string, number>;
}

interface Flow {
  date: string;
  /** Positivo = entra plata al portafolio; negativo = sale. */
  clp: number;
}

/**
 * Traduce el libro de operaciones a flujos en pesos.
 *
 * Una compra de acciones es plata que entra al portafolio de riesgo; una venta
 * es plata que sale. El monto usado es el neto de caja (con comisiones), porque
 * es el que realmente estuvo disponible para invertir en la alternativa.
 */
export function tradesToFlows(trades: Trade[], fxTrades: FxTrade[]): Flow[] {
  const flows: Flow[] = [];

  for (const t of trades) {
    const date = dayOf(t.executed_at);
    let clp = t.net_amount;

    if (t.currency === 'USD') {
      // Los pesos que costaron esos dólares. Si por alguna razón todavía no hay
      // una conversión registrada, la operación se omite antes que inventar un
      // tipo de cambio.
      const rate = avgAcquiredRate(fxTrades, date);
      if (rate === null) continue;
      clp = t.net_amount * rate;
    }

    flows.push({ date, clp: t.side === 'buy' ? clp : -clp });
  }

  return flows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Construye la posición del portafolio sombra a lo largo del eje de fechas.
 *
 * Sobre los dividendos del índice: se acumulan como EFECTIVO, no se
 * reinvierten, y cada uno se cuenta exactamente una vez. Del lado de la cartera
 * pasa lo mismo por otro camino: los dividendos entran a la caja y financian
 * compras posteriores, que aparecen en el libro de operaciones y por lo tanto
 * ya están dentro del valor de mercado de sus posiciones. Ninguno de los dos
 * lados suma sus dividendos dos veces.
 *
 * (Cuando el índice es de retorno total —el caso del S&P 500— la lista de
 * dividendos llega vacía a propósito: el propio índice ya los reinvierte.)
 *
 * `flowPrices` existe para el tramo en dólares: una compra del S&P se paga al
 * dólar de compra y se valoriza al de venta, igual que hace la app con las
 * posiciones reales en USD. Para el IPSA ambos precios son el mismo mapa.
 */
export function buildBenchmark(params: {
  flows: Flow[];
  dates: string[];
  /** Cierre del índice por fecha, en pesos, ya rellenado hacia adelante. */
  benchmarkPrices: Map<string, number>;
  /** Precio al que el portafolio sombra COMPRA. Por defecto, el de valorización. */
  flowPrices?: Map<string, number>;
  dividends: BenchmarkDividend[];
}): BenchmarkState {
  const { flows, dates, benchmarkPrices, dividends } = params;
  const flowPrices = params.flowPrices ?? benchmarkPrices;

  const divByDate = new Map<string, number>();
  for (const d of dividends) {
    divByDate.set(d.ex_date, (divByDate.get(d.ex_date) ?? 0) + d.amount_per_unit);
  }

  const units = new Map<string, number>();
  const cashDividends = new Map<string, number>();

  let runningUnits = 0;
  let runningCash = 0;
  let i = 0;

  for (const date of dates) {
    const price = benchmarkPrices.get(date);

    while (i < flows.length && flows[i].date <= date) {
      const f = flows[i];
      // El precio del día del flujo, no el del día que estamos pintando.
      const p = flowPrices.get(f.date) ?? flowPrices.get(date) ?? price;
      if (p && p > 0) {
        const delta = f.clp / p;
        runningUnits = Math.max(0, runningUnits + delta);
      }
      i++;
    }

    const perUnit = divByDate.get(date);
    if (perUnit) runningCash += runningUnits * perUnit;

    units.set(date, runningUnits);
    cashDividends.set(date, runningCash);
  }

  return { units, cashDividends };
}
