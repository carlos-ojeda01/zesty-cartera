import { FX_SPREAD_CLP } from './fx';
import type { FxTrade, Trade } from './types';

/**
 * Todo lo que la operatoria ha costado, sumado.
 *
 * Tarifas de Zesty (verificadas contra órdenes reales):
 *  - Bolsa de Santiago: 0,15% + IVA = 0,1785% del monto transado.
 *  - EE.UU.: ≈0,3% por lado, ya incluido en la orden.
 *  - Dólar: spread fijo de $10 por dólar y por lado (ver fx.ts).
 *
 * Las operaciones 'externa' —hechas en otra corredora antes del traspaso— se
 * cuentan aparte, junto con lo que habrían costado con la tarifa de Zesty, para
 * dimensionar cuánto pesó la comisión de la corredora anterior.
 */
export const ZESTY_FEE_RATE = 0.0015;
export const ZESTY_VAT = 0.19;
export const ZESTY_EFFECTIVE_RATE = ZESTY_FEE_RATE * (1 + ZESTY_VAT);

export interface CostBreakdown {
  /** Comisiones e IVA pagados en otras corredoras, en pesos. */
  externa: number;
  /** Comisiones e IVA pagados en Zesty, en pesos. */
  zesty: number;
  /** Costo del spread cambiario ya pagado al comprar dólares. */
  fxPaid: number;
  /** Costo del spread que falta pagar si liquidara la posición en dólares. */
  fxPending: number;
  total: number;
  /** Cuántas operaciones se contaron, por origen. */
  counts: { externa: number; zesty: number; fx: number };
  /**
   * Lo que las mismas operaciones externas en pesos habrían costado con la
   * tarifa chilena de Zesty.
   */
  externaAtZestyRates: number;
}

export function costBreakdown(params: {
  trades: Trade[];
  fxTrades: FxTrade[];
  /** Dólares que quedan en cartera, para estimar el spread pendiente. */
  usdHeld: number;
  /** Tipo de cambio para llevar a pesos las comisiones cobradas en dólares. */
  usdRate?: number;
}): CostBreakdown {
  const { trades, fxTrades, usdHeld, usdRate = 0 } = params;

  let externa = 0;
  let zesty = 0;
  let externaAtZestyRates = 0;
  let externaCount = 0;
  let zestyCount = 0;

  for (const t of trades) {
    const raw = t.commission + t.vat;
    const fees = t.currency === 'USD' ? raw * usdRate : raw;
    if (t.source === 'externa') {
      // Las operaciones estimadas no tienen comisión registrada y no deben contarse.
      if (fees === 0) continue;
      externa += fees;
      if (t.currency === 'CLP') externaAtZestyRates += t.gross_amount * ZESTY_EFFECTIVE_RATE;
      externaCount++;
    } else {
      zesty += fees;
      zestyCount++;
    }
  }

  let fxPaid = 0;
  for (const f of fxTrades) {
    fxPaid += FX_SPREAD_CLP * f.usd_amount;
  }

  const fxPending = FX_SPREAD_CLP * usdHeld;

  return {
    externa,
    zesty,
    fxPaid,
    fxPending,
    total: externa + zesty + fxPaid + fxPending,
    counts: { externa: externaCount, zesty: zestyCount, fx: fxTrades.length },
    externaAtZestyRates,
  };
}
