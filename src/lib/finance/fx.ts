import type { FxTrade, PriceRow } from './types';

/**
 * El spread de Zesty en el cambio USD/CLP es FIJO: $10 por dólar, por lado.
 * No es un porcentaje, y eso cambia el comportamiento por completo.
 *
 * Un spread fijo pesa más cuando el peso está fuerte y se diluye cuando se
 * debilita: 1,11% por lado a 900 CLP/USD contra 1,00% a 1.000. Modelarlo como
 * porcentaje daría el signo equivocado a esa sensibilidad.
 *
 * Verificado contra operaciones reales: la tasa que cobra Zesty es el mid del
 * instante más $10. El cierre de Yahoo del día es un corte horario distinto, así
 * que la regla de los $10 manda y Yahoo solo sirve de contraste.
 */
export const FX_SPREAD_CLP = 10;

/** Lo que pagas por cada dólar que compras. */
export const buyRate = (mid: number) => mid + FX_SPREAD_CLP;

/** Lo que recibes por cada dólar que vendes. */
export const sellRate = (mid: number) => mid - FX_SPREAD_CLP;

export const FX_TICKER = 'CLP=X';

/**
 * Tipo de cambio mid por fecha, con relleno hacia adelante.
 *
 * El mercado cambiario y las bolsas no comparten calendario, así que un día
 * hábil en Santiago puede no tener punto en CLP=X. En vez de dejar un hueco se
 * arrastra el último valor conocido, que es lo que haría cualquier mesa.
 */
export function buildFxIndex(prices: PriceRow[], dates: string[]): Map<string, number> {
  const raw = new Map<string, number>();
  for (const p of prices) {
    if (p.yahoo_ticker === FX_TICKER) raw.set(p.price_date, p.close);
  }

  const out = new Map<string, number>();
  let last: number | null = null;
  for (const d of dates) {
    const v = raw.get(d);
    if (v !== undefined) last = v;
    if (last !== null) out.set(d, last);
  }

  // Si la serie de precios empieza después que el eje de fechas, rellenamos
  // hacia atrás con el primer valor conocido para no dejar el inicio en blanco.
  if (out.size < dates.length) {
    const first = dates.find((d) => out.has(d));
    if (first !== undefined) {
      const firstValue = out.get(first)!;
      for (const d of dates) {
        if (d >= first) break;
        out.set(d, firstValue);
      }
    }
  }

  return out;
}

/**
 * Tasa promedio ponderada a la que realmente se compraron los dólares hasta
 * una fecha dada. Es el costo en pesos de cada dólar que tiene invertido.
 *
 * Se usa para traducir las compras en dólares a pesos dentro del benchmark: la
 * pregunta que responde el gráfico es "¿qué habría pasado con ESOS pesos?", así
 * que hay que entrar con los pesos que efectivamente salieron de la cuenta.
 */
export function avgAcquiredRate(fxTrades: FxTrade[], upTo: string): number | null {
  let clp = 0;
  let usd = 0;
  for (const f of fxTrades) {
    if (f.side !== 'buy') continue;
    if (f.executed_at.slice(0, 10) > upTo) continue;
    clp += f.clp_amount;
    usd += f.usd_amount;
  }
  return usd > 0 ? clp / usd : null;
}

/**
 * El tipo de cambio al que dejas de perder plata: por debajo de este mid, la
 * posición en dólares vale menos pesos de los que costó, aunque en USD vaya
 * ganando.
 */
export function breakevenMid(clpInvested: number, usdHeld: number): number | null {
  if (usdHeld <= 0) return null;
  return clpInvested / usdHeld + FX_SPREAD_CLP;
}

export interface FxBridge {
  /** Pesos que salieron de la cuenta para comprar los dólares. */
  clpInvested: number;
  /** Dólares que se obtuvieron con esos pesos. */
  usdAcquired: number;
  /** Tasa efectiva pagada, spread incluido. */
  rateAcquired: number;
  /** Valor actual de la posición, en dólares. */
  usdNow: number;
  /** Retorno en la moneda del activo. */
  returnUsd: number;
  /** Mid actual. */
  midNow: number;
  /** Pesos que llegarían a la cuenta al liquidar todo hoy. */
  clpNow: number;
  /** Retorno real en pesos, que es el que importa. */
  returnClp: number;
  /** Tramos de la cascada, en pesos. Suman clpNow - clpInvested. */
  bridge: {
    /** Cuánto aportó la subida del activo, valorizada al mid de compra. */
    asset: number;
    /** Cuánto aportó (o restó) el movimiento del tipo de cambio. */
    currency: number;
    /** Lo que costó el spread al comprar los dólares. */
    spreadIn: number;
    /** Lo que costaría el spread al venderlos. */
    spreadOut: number;
  };
  /** Mid al que el resultado en pesos queda en cero. */
  breakeven: number | null;
}

/**
 * Descompone el resultado del tramo en dólares en sus cuatro causas.
 *
 * Sin esto, un +6,6% en USD parece una buena noticia. La cascada muestra que
 * después del tipo de cambio y de los dos spreads queda bastante menos.
 */
export function fxBridge(params: {
  clpInvested: number;
  usdAcquired: number;
  usdNow: number;
  midNow: number;
}): FxBridge {
  const { clpInvested, usdAcquired, usdNow, midNow } = params;

  const rateAcquired = usdAcquired > 0 ? clpInvested / usdAcquired : 0;
  const midIn = rateAcquired - FX_SPREAD_CLP;
  const clpNow = usdNow * sellRate(midNow);

  // La cascada se arma en este orden: primero cuánto rindió el activo a tipo de
  // cambio congelado, después cuánto movió la divisa, y al final los dos peajes.
  const spreadIn = -FX_SPREAD_CLP * usdAcquired;
  const asset = (usdNow - usdAcquired) * midIn;
  const currency = usdNow * (midNow - midIn);
  const spreadOut = -FX_SPREAD_CLP * usdNow;

  return {
    clpInvested,
    usdAcquired,
    rateAcquired,
    usdNow,
    returnUsd: usdAcquired > 0 ? usdNow / usdAcquired - 1 : 0,
    midNow,
    clpNow,
    returnClp: clpInvested > 0 ? clpNow / clpInvested - 1 : 0,
    bridge: { asset, currency, spreadIn, spreadOut },
    breakeven: breakevenMid(clpInvested, usdNow),
  };
}
