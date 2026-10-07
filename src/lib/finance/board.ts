/**
 * Derivaciones que pide el tablero nuevo y que la librería no tenía: la tabla
 * de posiciones, el libro de movimientos, el detalle de dividendos y la caja.
 *
 * La regla que atraviesa todo el archivo: el costo de una posición en dólares
 * se reconstruye desde las operaciones, al tipo de cambio que el usuario
 * efectivamente pagó, y no desde `cost_basis` de la API. `cost_basis` viene en
 * dólares, y convertirlo al dólar de hoy mezclaría el resultado del papel con
 * el del tipo de cambio. Es la misma decisión que ya toma `series.ts` para el
 * capital aportado; si los dos módulos no coincidieran, la rentabilidad de la
 * tabla no cuadraría con la del gráfico.
 */

import { avgAcquiredRate, FX_SPREAD_CLP, FX_TICKER, sellRate } from './fx';
import { dayOf } from './holdings';
import type { Balance, CashMovement, PriceRow, Scope, Snapshot, Trade, TradeSource } from './types';

const inScope = (market: string, scope: Scope) => scope === 'all' || market === scope;

/** Serie de un ticker, ordenada por fecha. */
function closes(snapshot: Snapshot, ticker: string): PriceRow[] {
  return snapshot.prices
    .filter((p) => p.yahoo_ticker === ticker)
    .slice()
    .sort((a, b) => a.price_date.localeCompare(b.price_date));
}

/**
 * Una fila es de una sesión real cuando el rango del día no es un punto, o
 * cuando la puso la corredora.
 *
 * Yahoo repite el último cierre conocido los días que no alcanza a cubrir, y
 * esas filas quedan con `low === high === close`. Contarlas como sesiones
 * convierte cualquier variación en una mentira: hay papeles chilenos que pasan
 * semanas clavados en un cierre viejo, y comparar las dos últimas filas da un
 * "+35% en el día" que en realidad es el movimiento de dos meses.
 *
 * Un papel ilíquido puede cerrar de verdad con low === high, pero entonces no se
 * movió, y descartarlo no cambia ninguna cuenta.
 *
 * Las filas de la corredora son la excepción: son cierres de verdad, solo que
 * sin rango intradiario. Son justamente las que rescatan los días que Yahoo no
 * publica, así que descartarlas por no traer OHLC anularía el respaldo entero.
 */
const isRealSession = (p: PriceRow) =>
  p.source === 'zesty' || (p.low !== null && p.high !== null && p.low !== p.high);

/** Distancia en días calendario entre dos fechas ISO. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(from + 'T00:00:00Z');
  const b = Date.parse(to + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/**
 * Un fin de semana largo cabe en cuatro días. Más que eso ya no es "la
 * variación del día" por mucho que sean dos filas consecutivas en la tabla.
 */
const MAX_SESSION_GAP = 4;

export interface Quote {
  close: number | null;
  /** Variación contra la sesión real anterior, sea de un día o de dos meses. */
  changePct: number | null;
  date: string | null;
  prevDate: string | null;
  /** Días entre las dos sesiones comparadas. */
  gapDays: number | null;
  /** El salto es de una sesión a la siguiente y puede llamarse variación del día. */
  isDaily: boolean;
  /**
   * Variación contra el cierre publicado inmediatamente anterior, venga de una
   * sesión real o arrastrado por el proveedor.
   *
   * Es la definición corriente de "variación del día": toda corredora compara
   * el último cierre contra el anterior sin preguntarse si hubo transacciones.
   * Convive con `changePct`, que es más estricta y solo compara sesiones
   * reales, porque las dos preguntas son distintas: esta es para mostrar un
   * número en la franja de arriba, la otra para decidir si un precio quedó
   * rezagado y no se puede usar en una suma.
   */
  dailyChangePct: number | null;
  /** El cierre con el que se compara venía arrastrado, no de una sesión real. */
  prevWasCarried: boolean;
}

const EMPTY_QUOTE: Quote = {
  close: null,
  changePct: null,
  date: null,
  prevDate: null,
  gapDays: null,
  isDaily: false,
  dailyChangePct: null,
  prevWasCarried: false,
};

export function quote(snapshot: Snapshot, ticker: string): Quote {
  const all = closes(snapshot, ticker);
  if (all.length === 0) return EMPTY_QUOTE;

  // Si el ticker no trae OHLC en ninguna fila no hay forma de distinguir
  // relleno de sesión, y se usa la serie completa.
  const real = all.filter(isRealSession);
  const rows = real.length >= 2 ? real : all;

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];

  // Contra la fila anterior sin más, que es como se calcula la variación del
  // día en cualquier pantalla de corredora.
  const prevRow = all.length >= 2 ? all[all.length - 2] : null;
  const daily = {
    dailyChangePct:
      prevRow && prevRow.close > 0 ? all[all.length - 1].close / prevRow.close - 1 : null,
    prevWasCarried: prevRow ? !isRealSession(prevRow) : false,
  };

  if (!prev || prev.close <= 0) {
    return { ...EMPTY_QUOTE, ...daily, close: last.close, date: last.price_date };
  }

  const gapDays = daysBetween(prev.price_date, last.price_date);

  return {
    ...daily,
    close: last.close,
    changePct: last.close / prev.close - 1,
    date: last.price_date,
    prevDate: prev.price_date,
    gapDays,
    isDaily: gapDays <= MAX_SESSION_GAP,
  };
}

/**
 * Tipo de cambio al que se valoriza el tramo en dólares.
 * En 'real' se descuenta el spread de venta: son los pesos que llegarían a la
 * cuenta si liquidara hoy, no los que muestra el mid de mercado.
 */
export function usdFactor(snapshot: Snapshot, usdMode: 'real' | 'nominal'): number {
  const mid = quote(snapshot, FX_TICKER).close ?? 0;
  return usdMode === 'real' ? sellRate(mid) : mid;
}

/** Tipo de cambio mid vigente en una fecha dada (último disponible hacia atrás). */
function midOn(snapshot: Snapshot, date: string): number {
  const rows = closes(snapshot, FX_TICKER);
  let out = 0;
  for (const r of rows) {
    if (r.price_date > date) break;
    out = r.close;
  }
  return out || (rows[rows.length - 1]?.close ?? 0);
}

/** Los pesos que salieron (compra) o entraron (venta) de la caja por una operación. */
function tradeClp(snapshot: Snapshot, t: Trade): number {
  if (t.currency !== 'USD') return t.net_amount;
  const date = dayOf(t.executed_at);
  return t.net_amount * (avgAcquiredRate(snapshot.fxTrades, date) ?? midOn(snapshot, date));
}

export interface PositionRow {
  symbol: string;
  name: string;
  market: 'cl' | 'us';
  currency: 'CLP' | 'USD';
  qty: number;
  /** Precio promedio de compra, en moneda local del instrumento. */
  avgLocal: number;
  /** Último precio, en moneda local. */
  price: number | null;
  /** Valor de mercado en pesos. */
  value: number;
  /** Costo en pesos, al tipo de cambio efectivamente pagado. */
  cost: number;
  /**
   * Rentabilidad total: valor de mercado contra costo.
   *
   * No suma los dividendos aparte. Los que se cobraron financiaron compras
   * posteriores que ya están en `value` y en `cost`; volver a sumarlos los
   * contaría dos veces. Lo que aportan se mide en `yoc`, que es otra pregunta.
   */
  totalPct: number | null;
  /**
   * Variación del último día. Es null cuando el precio más reciente no viene
   * de una sesión pegada a la anterior: en ese caso no hay "día" que informar.
   */
  dayPct: number | null;
  /** Variación contra la sesión real anterior, dure lo que dure el salto. */
  changePct: number | null;
  /** Fecha del precio usado para valorizar. */
  priceDate: string | null;
  /** Fecha de la sesión contra la que se compara `changePct`. */
  changeSince: string | null;
  /** El precio no es de una sesión reciente: la sincronización quedó atrás. */
  stale: boolean;
  /** Dividendos cobrados de este símbolo, en pesos. */
  divs: number;
  /** Yield sobre costo. */
  yoc: number | null;
  /** Peso dentro del alcance seleccionado. */
  weight: number;
  /** El precio no vino de Yahoo: se valorizó a costo y hay que decirlo. */
  priced: boolean;
}

export interface BoardTotals {
  value: number;
  /** Costo de las posiciones ABIERTAS. Es el denominador del yield sobre costo. */
  cost: number;
  /**
   * Capital invertido neto: todo lo comprado menos todo lo vendido, en el
   * alcance completo y con comisiones dentro.
   *
   * No es lo mismo que `cost`. Cuando una posición se cierra deja de sumar
   * costo, pero la venta sí descontó capital, y si se vendió con ganancia esa
   * plata salió de la cuenta de aportes. La diferencia entre los dos es
   * `realized`. Este es el denominador de la rentabilidad del tablero, el mismo
   * que usa la serie del gráfico: si no lo fuera, la cifra grande y el pie de
   * la tabla mostrarían dos porcentajes distintos de lo mismo.
   */
  invested: number;
  /** Resultado ya realizado en posiciones cerradas. Positivo si se ganó. */
  realized: number;
  divs: number;
  totalPct: number | null;
  yoc: number | null;
  /** Variación del día en pesos. Solo suma las posiciones con precio fresco. */
  dayAbs: number;
  dayPct: number | null;
  /** Fracción del valor de la cartera que sí tiene precio del día. */
  dayCoverage: number;
  /** Posiciones cuyo precio quedó atrás en la última sincronización. */
  staleCount: number;
  /** La fecha más antigua entre esos precios rezagados. */
  stalestDate: string | null;
}

/**
 * Tabla de posiciones abiertas.
 *
 * Se arma desde el libro de operaciones y no desde `snapshot.positions` porque
 * ese endpoint entrega el costo en moneda local. La cantidad y el precio de la
 * API se usan solo como respaldo cuando Yahoo no cubre el instrumento.
 */
export function buildPositionRows(
  snapshot: Snapshot,
  opts: { scope: Scope; usdMode: 'real' | 'nominal' },
): { rows: PositionRow[]; totals: BoardTotals } {
  const { scope, usdMode } = opts;
  const factor = usdFactor(snapshot, usdMode);
  const assetBy = new Map(snapshot.assets.map((a) => [a.symbol, a]));

  interface Acc {
    qty: number;
    buyQty: number;
    buyLocal: number;
    cost: number;
  }
  const acc = new Map<string, Acc>();

  for (const t of snapshot.trades) {
    if (!inScope(t.market, scope)) continue;
    let a = acc.get(t.symbol);
    if (!a) acc.set(t.symbol, (a = { qty: 0, buyQty: 0, buyLocal: 0, cost: 0 }));
    const clp = tradeClp(snapshot, t);
    if (t.side === 'buy') {
      a.qty += t.qty;
      a.buyQty += t.qty;
      a.buyLocal += t.qty * t.price;
      a.cost += clp;
    } else {
      a.qty -= t.qty;
      a.cost -= clp;
    }
  }

  // Dividendos por símbolo, convertidos al mid del día de pago.
  const divBy = new Map<string, number>();
  for (const d of snapshot.dividends) {
    if (!inScope(d.market, scope)) continue;
    const clp = d.currency === 'USD' ? d.amount * midOn(snapshot, d.paid_at) : d.amount;
    divBy.set(d.symbol, (divBy.get(d.symbol) ?? 0) + clp);
  }

  const rows: PositionRow[] = [];

  for (const [symbol, a] of acc) {
    // Las posiciones cerradas salen de la tabla: su historia vive en
    // Movimientos, no en un listado de lo que se tiene hoy.
    if (Math.abs(a.qty) < 1e-9) continue;

    const asset = assetBy.get(symbol);
    const apiPos = snapshot.positions.find((p) => p.symbol === symbol);
    const q = quote(snapshot, asset?.yahoo_ticker ?? '');

    const price = q.close ?? apiPos?.current_price ?? null;
    const local = price ?? a.buyLocal / (a.buyQty || 1);
    const usd = asset?.currency === 'USD' || apiPos?.currency === 'USD';
    const value = a.qty * local * (usd ? factor : 1);
    const divs = divBy.get(symbol) ?? 0;

    rows.push({
      symbol,
      name: asset?.name ?? symbol,
      market: (asset?.market ?? apiPos?.market ?? 'cl') as 'cl' | 'us',
      currency: usd ? 'USD' : 'CLP',
      qty: a.qty,
      avgLocal: a.buyQty > 0 ? a.buyLocal / a.buyQty : 0,
      price,
      value,
      cost: a.cost,
      totalPct: a.cost > 0 ? value / a.cost - 1 : null,
      dayPct: q.isDaily ? q.changePct : null,
      changePct: q.changePct,
      priceDate: q.date,
      changeSince: q.prevDate,
      stale: price !== null && !q.isDaily,
      divs,
      yoc: a.cost > 0 ? divs / a.cost : null,
      weight: 0,
      priced: price !== null,
    });
  }

  const value = rows.reduce((s, r) => s + r.value, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const divs = rows.reduce((s, r) => s + r.divs, 0);

  // Sobre TODOS los símbolos, incluidos los ya cerrados: es lo que queda
  // realmente comprometido en el alcance.
  let invested = 0;
  for (const a of acc.values()) invested += a.cost;
  for (const r of rows) r.weight = value > 0 ? r.value / value : 0;

  // La variación del día se pondera por el valor de cada posición: un 3% en
  // algo que pesa 2% de la cartera no mueve el total un 3%. Las posiciones sin
  // precio del día quedan fuera de la suma Y del denominador, para no diluir
  // la cifra con papeles que sencillamente no se actualizaron.
  const fresh = rows.filter((r) => r.dayPct !== null);
  const freshValue = fresh.reduce((s, r) => s + r.value, 0);
  const dayAbs = fresh.reduce(
    (s, r) => s + (r.value * (r.dayPct as number)) / (1 + (r.dayPct as number)),
    0,
  );

  const staleRows = rows.filter((r) => r.stale);
  const stalestDate = staleRows.reduce<string | null>(
    (min, r) => (r.changeSince && (!min || r.changeSince < min) ? r.changeSince : min),
    null,
  );

  return {
    rows,
    totals: {
      value,
      cost,
      invested,
      realized: cost - invested,
      divs,
      totalPct: invested > 0 ? value / invested - 1 : null,
      yoc: cost > 0 ? divs / cost : null,
      dayAbs,
      dayPct: freshValue - dayAbs !== 0 ? dayAbs / (freshValue - dayAbs) : null,
      dayCoverage: value > 0 ? freshValue / value : 0,
      staleCount: staleRows.length,
      stalestDate,
    },
  };
}

export interface MoveRow {
  id: string;
  date: string;
  side: 'buy' | 'sell';
  symbol: string;
  name: string;
  source: TradeSource;
  qty: number;
  price: number;
  currency: 'CLP' | 'USD';
  fee: number;
  /** Neto en pesos, con signo: negativo si salió plata de la cuenta. */
  amount: number;
}

export function buildMoveRows(snapshot: Snapshot, scope: Scope): MoveRow[] {
  const assetBy = new Map(snapshot.assets.map((a) => [a.symbol, a]));
  return snapshot.trades
    .filter((t) => inScope(t.market, scope))
    .slice()
    .sort((a, b) => b.executed_at.localeCompare(a.executed_at))
    .map((t) => {
      const clp = tradeClp(snapshot, t);
      return {
        id: t.id,
        date: dayOf(t.executed_at),
        side: t.side,
        symbol: t.symbol,
        name: assetBy.get(t.symbol)?.name ?? t.symbol,
        source: t.source,
        qty: t.qty,
        price: t.price,
        currency: t.currency,
        fee: t.commission + t.vat,
        amount: t.side === 'buy' ? -clp : clp,
      };
    });
}

export interface DividendRow {
  id: string;
  date: string;
  symbol: string;
  name: string;
  currency: 'CLP' | 'USD';
  original: number;
  /** Monto en pesos, al mid del día de pago. */
  amount: number;
}

export function buildDividendRows(snapshot: Snapshot, scope: Scope): DividendRow[] {
  const assetBy = new Map(snapshot.assets.map((a) => [a.symbol, a]));
  return snapshot.dividends
    .filter((d) => inScope(d.market, scope))
    .slice()
    .sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    .map((d) => ({
      id: d.id,
      date: d.paid_at,
      symbol: d.symbol,
      name: assetBy.get(d.symbol)?.name ?? d.symbol,
      currency: d.currency,
      original: d.amount,
      amount: d.currency === 'USD' ? d.amount * midOn(snapshot, d.paid_at) : d.amount,
    }));
}

/**
 * Últimos doce meses de dividendos, mes a mes.
 * Los meses sin pago se devuelven en cero en vez de omitirse: un histograma con
 * los huecos borrados miente sobre la regularidad del flujo.
 */
export function dividendsByMonth(
  rows: DividendRow[],
  months = 12,
): { key: string; label: string; value: number }[] {
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.date.slice(0, 7), (by.get(r.date.slice(0, 7)) ?? 0) + r.amount);

  const last = rows[0]?.date ?? new Date().toISOString().slice(0, 10);
  const [y, m] = last.split('-').map(Number);
  const out: { key: string; label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    out.push({ key, label: MESES[d.getUTCMonth()], value: by.get(key) ?? 0 });
  }
  return out;
}

export interface CashBalance {
  /** Pesos ya liquidados: se pueden invertir y también retirar hoy. */
  clpSettled: number;
  /**
   * Pesos de ventas ejecutadas que la corredora libera en dos días hábiles.
   *
   * Cuentan como caja igual. El día de la venta el dinero ya es del usuario y ya
   * puede volver a comprar otro instrumento con él; lo único que no puede
   * hacer todavía es sacarlo de Zesty o pasarlo a dólares. Tratarlo como un
   * casillero aparte hacía desaparecer un tercio de millón de la cifra
   * principal por dos días, que es justo cuando se mira.
   */
  clpPending: number;
  /** Caja en pesos, que es lo que se puede poner a trabajar en la bolsa local. */
  clp: number;
  /** Caja en dólares, incluida la que esté liquidando en el mercado gringo. */
  usd: number;
  /** Esos dólares traídos a pesos al precio al que Zesty los compra. */
  usdInClp: number;
  /** Mid de mercado del día. */
  mid: number;
  /** Tasa efectiva de conversión: el mid menos el spread de venta. */
  sell: number;
  /** Lo que se deja en el spread por pasar toda la caja en dólares a pesos. */
  spreadCost: number;
  /** Caja total expresada en pesos. Es la cifra grande. */
  total: number;
}

/**
 * Las dos cajas de la cuenta y su suma en pesos.
 *
 * Son cajas separadas de verdad, no dos vistas de la misma: con pesos se
 * compra en la bolsa chilena y con dólares en la gringa, y pasar de una a otra
 * cuesta el spread. Por eso el total no usa el mid sino `sellRate`: es lo que
 * Zesty pagaría hoy por esos dólares, no lo que dice la pizarra.
 *
 * El pendiente de liquidar se suma a la caja de su propia moneda. Sumarlo todo
 * a los pesos, como hacía la versión anterior, funcionaba solo porque el
 * mercado gringo nunca tenía nada liquidando; el día que lo tuviera habría
 * metido centavos de dólar en una suma de pesos sin avisar.
 */
export function buildCashBalance(snapshot: Snapshot, balances: Balance[]): CashBalance {
  const cl = balances.find((b) => b.market === 'cl');
  const us = balances.find((b) => b.market === 'us');

  const clpSettled = cl?.cash ?? 0;
  const clpPending = cl?.pending_settlement ?? 0;
  const usd = (us?.cash ?? 0) + (us?.pending_settlement ?? 0);

  // Sin serie de tipo de cambio no se inventa una conversión: `sellRate(0)`
  // daría -10 y la caja en dólares restaría plata del total.
  const mid = quote(snapshot, FX_TICKER).close ?? 0;
  const sell = mid > 0 ? sellRate(mid) : 0;

  const clp = clpSettled + clpPending;
  const usdInClp = usd * sell;

  return {
    clpSettled,
    clpPending,
    clp,
    usd,
    usdInClp,
    mid,
    sell,
    spreadCost: mid > 0 ? usd * FX_SPREAD_CLP : 0,
    total: clp + usdInClp,
  };
}

export interface CashRow {
  id: string;
  date: string;
  kind: 'deposit' | 'withdrawal';
  amount: number;
  currency: string;
  /** Saldo acumulado de aportes netos hasta esta fila, inclusive. */
  balance: number;
}

/**
 * Cartola de aportes y retiros, de la más reciente a la más antigua.
 * El saldo se acumula en orden cronológico y recién después se invierte el
 * orden: acumular sobre la lista ya invertida daría la serie al revés.
 */
export function buildCashRows(movements: CashMovement[]): CashRow[] {
  const asc = movements
    .slice()
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  let balance = 0;
  const withBalance = asc.map((c) => {
    const signed = c.kind === 'withdrawal' ? -Math.abs(c.amount) : Math.abs(c.amount);
    balance += signed;
    return {
      id: c.id,
      date: dayOf(c.occurred_at),
      kind: c.kind,
      amount: signed,
      currency: c.currency,
      balance,
    };
  });

  return withBalance.reverse();
}
