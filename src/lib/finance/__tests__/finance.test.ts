import { describe, expect, it } from 'vitest';

import { tradesToFlows } from '../benchmark';
import { buildCashBalance, buildPositionRows, quote } from '../board';
import { ZESTY_EFFECTIVE_RATE, costBreakdown } from '../costs';
import { FX_SPREAD_CLP, breakevenMid, buyRate, fxBridge, sellRate } from '../fx';
import { buildDailyHoldings, firstTradeDate } from '../holdings';
import { buildSeries } from '../series';
import type { FxTrade, Trade } from '../types';

/**
 * Datos sintéticos: una cartera inventada, con números redondos para que cada
 * resultado se pueda verificar a mano.
 */
const trade = (
  id: string,
  source: 'zesty' | 'externa',
  symbol: string,
  market: 'cl' | 'us',
  side: 'buy' | 'sell',
  executed_at: string,
  qty: number,
  price: number,
  commission = 0,
  vat = 0,
): Trade => {
  const gross = qty * price;
  const fees = commission + vat;
  return {
    id,
    source,
    symbol,
    market,
    side,
    executed_at,
    qty,
    price,
    gross_amount: gross,
    commission,
    vat,
    net_amount: side === 'buy' ? gross + fees : gross - fees,
    currency: market === 'us' ? 'USD' : 'CLP',
    note: null,
  };
};

const TRADES: Trade[] = [
  trade('e1', 'externa', 'AAA', 'cl', 'buy', '2025-10-01T16:00:00Z', 100, 1000, 1990),
  trade('z1', 'zesty', 'BBB', 'cl', 'buy', '2026-01-10T14:00:00Z', 50, 2000, 150, 29),
  trade('z2', 'zesty', 'AAA', 'cl', 'sell', '2026-03-02T14:00:00Z', 40, 1200, 72, 14),
  trade('z3', 'zesty', 'USX', 'us', 'buy', '2026-04-10T15:30:00Z', 2, 200, 1.2),
];

const FX_TRADES: FxTrade[] = [
  { id: 'f1', side: 'buy', executed_at: '2026-04-10T15:00:00Z', clp_amount: 384000, usd_amount: 400, rate: 960, spot_rate: null },
];

describe('reconstrucción de la cartera', () => {
  it('reproduce las cantidades desde el libro de operaciones', () => {
    const today = '2026-09-01';
    const holdings = buildDailyHoldings(TRADES, [today]).get(today)!;
    expect(holdings.get('AAA')).toBe(60);
    expect(holdings.get('BBB')).toBe(50);
    expect(holdings.get('USX')).toBe(2);
  });

  it('arranca en la primera operación, aunque sea de otra corredora', () => {
    expect(firstTradeDate(TRADES)).toBe('2025-10-01');
  });

  it('mantiene la tenencia intermedia antes de una venta', () => {
    const holdings = buildDailyHoldings(TRADES, ['2026-02-01', '2026-03-02']);
    expect(holdings.get('2026-02-01')!.get('AAA')).toBe(100);
    expect(holdings.get('2026-03-02')!.get('AAA')).toBe(60);
  });
});

describe('spread cambiario', () => {
  it('es fijo en $10 por dólar, no porcentual', () => {
    expect(buyRate(923.66)).toBe(933.66);
    expect(sellRate(923.66)).toBe(913.66);
    // Un spread fijo se diluye cuando el peso se debilita: el porcentaje BAJA
    // aunque el monto en pesos sea el mismo.
    expect(FX_SPREAD_CLP / 900).toBeGreaterThan(FX_SPREAD_CLP / 1000);
  });
});

describe('rentabilidad real del tramo en dólares', () => {
  const leg = { clpInvested: 384000, usdAcquired: 400, usdNow: 450, midNow: 940 };
  const bridge = fxBridge(leg);

  it('rinde +12,5% en dólares', () => {
    expect(bridge.returnUsd).toBeCloseTo(0.125, 9);
  });

  it('en pesos se descuenta el spread de salida', () => {
    // 450 × (940 − 10) = 418.500 contra 384.000 invertidos.
    expect(bridge.clpNow).toBeCloseTo(418500, 6);
    expect(bridge.returnClp).toBeCloseTo(418500 / 384000 - 1, 9);
  });

  it('reconstruye la tasa efectivamente pagada', () => {
    expect(bridge.rateAcquired).toBeCloseTo(960, 9);
  });

  it('calcula el dólar bajo el cual se pierde plata en pesos', () => {
    expect(bridge.breakeven!).toBeCloseTo(384000 / 450 + FX_SPREAD_CLP, 6);
  });

  it('descompone el resultado sin dejar residuo', () => {
    const { asset, currency, spreadIn, spreadOut } = bridge.bridge;
    expect(asset + currency + spreadIn + spreadOut).toBeCloseTo(bridge.clpNow - bridge.clpInvested, 6);
  });

  it('cobra el spread dos veces, una por lado', () => {
    expect(bridge.bridge.spreadIn).toBeCloseTo(-FX_SPREAD_CLP * leg.usdAcquired, 6);
    expect(bridge.bridge.spreadOut).toBeCloseTo(-FX_SPREAD_CLP * leg.usdNow, 6);
  });
});

describe('breakevenMid', () => {
  it('devuelve null si no hay dólares en cartera', () => {
    expect(breakevenMid(100000, 0)).toBeNull();
  });
});

describe('costos de operar', () => {
  const costs = costBreakdown({ trades: TRADES, fxTrades: FX_TRADES, usdHeld: 450, usdRate: 950 });

  it('separa las comisiones de otras corredoras de las de Zesty', () => {
    expect(costs.externa).toBe(1990);
    expect(costs.counts.externa).toBe(1);
    // 150 + 29 + 72 + 14 en pesos, más US$1,20 a 950.
    expect(costs.zesty).toBeCloseTo(265 + 1.2 * 950, 6);
  });

  it('compara la comisión externa con la tarifa de Zesty', () => {
    expect(costs.externaAtZestyRates).toBeCloseTo(100000 * ZESTY_EFFECTIVE_RATE, 6);
  });

  it('cobra el spread cambiario ya pagado y el pendiente', () => {
    expect(costs.fxPaid).toBe(4000);
    expect(costs.fxPending).toBe(4500);
  });
});

describe('eventos que caen fuera del calendario bursátil', () => {
  // Zesty a veces registra una venta en sábado. Indexar los eventos por fecha
  // exacta contra el eje de días con precio la hacía desaparecer, dejando el
  // capital invertido inflado en el monto de la venta. Este test fija el
  // comportamiento correcto.
  const snapshot = {
    assets: [
      { symbol: 'X', market: 'cl' as const, name: 'X', asset_type: 'Stock', yahoo_ticker: 'X.SN', currency: 'CLP' as const, is_benchmark: false, syncs_prices: true },
      { symbol: 'B', market: 'cl' as const, name: 'B', asset_type: 'ETF', yahoo_ticker: 'B.SN', currency: 'CLP' as const, is_benchmark: true, syncs_prices: true },
    ],
    trades: [
      { id: 'c', source: 'zesty' as const, symbol: 'X', market: 'cl' as const, side: 'buy' as const, executed_at: '2026-07-30T12:00:00Z', qty: 100, price: 1000, gross_amount: 100000, commission: 0, vat: 0, net_amount: 100000, currency: 'CLP' as const, note: null },
      // Sábado: no existe en el eje de precios.
      { id: 'v', source: 'zesty' as const, symbol: 'X', market: 'cl' as const, side: 'sell' as const, executed_at: '2026-08-01T07:00:00Z', qty: 100, price: 1100, gross_amount: 110000, commission: 0, vat: 0, net_amount: 110000, currency: 'CLP' as const, note: null },
    ],
    prices: [
      { yahoo_ticker: 'X.SN', price_date: '2026-07-30', close: 1000, adj_close: null, low: null, high: null },
      { yahoo_ticker: 'X.SN', price_date: '2026-07-31', close: 1050, adj_close: null, low: null, high: null },
      { yahoo_ticker: 'X.SN', price_date: '2026-08-03', close: 1100, adj_close: null, low: null, high: null },
      { yahoo_ticker: 'B.SN', price_date: '2026-07-30', close: 5000, adj_close: null, low: null, high: null },
      { yahoo_ticker: 'B.SN', price_date: '2026-07-31', close: 5000, adj_close: null, low: null, high: null },
      { yahoo_ticker: 'B.SN', price_date: '2026-08-03', close: 5000, adj_close: null, low: null, high: null },
      { yahoo_ticker: 'CLP=X', price_date: '2026-07-30', close: 930, adj_close: null, low: null, high: null },
      { yahoo_ticker: 'CLP=X', price_date: '2026-07-31', close: 930, adj_close: null, low: null, high: null },
      { yahoo_ticker: 'CLP=X', price_date: '2026-08-03', close: 930, adj_close: null, low: null, high: null },
    ],
    // Dividendo pagado un domingo.
    dividends: [
      { id: 'd', symbol: 'X', market: 'cl' as const, paid_at: '2026-08-02', amount: 7000, currency: 'CLP' as const },
    ],
    benchmarkDividends: [],
    fxTrades: [],
    positions: [],
  };

  const { points } = buildSeries(snapshot, {
    scope: 'all',
    usdMode: 'real',
    benchmark: 'ipsa',
  });
  const last = points.at(-1)!;

  it('resta la venta hecha en sábado', () => {
    // Compró por 100.000 y vendió por 110.000: el capital neto queda negativo.
    expect(last.invested).toBeCloseTo(-10000, 6);
  });

  it('deja la posición en cero después de la venta', () => {
    // Vendido todo, no queda nada que valorizar.
    expect(last.portfolio).toBeCloseTo(0, 6);
  });

  // Los dividendos cobrados van a la caja y desde ahí financian compras
  // posteriores, que ya entran a la serie como operaciones. Sumarlos también al
  // valor de mercado los contaba dos veces: la cifra grande del tablero no
  // cuadraba con la suma de las posiciones, y la diferencia era exactamente el
  // total de dividendos.
  it('no vuelve a sumar el dividendo cobrado al valor de mercado', () => {
    const sinDividendo = buildSeries(
      { ...snapshot, dividends: [] },
      { scope: 'all', usdMode: 'real', benchmark: 'ipsa' },
    ).points.at(-1)!;
    expect(last.portfolio).toBeCloseTo(sinDividendo.portfolio, 6);
  });

  // La tabla de posiciones y la serie del gráfico tienen que medir la
  // rentabilidad contra el MISMO capital. Cuando la tabla sumaba solo el costo
  // de las posiciones abiertas, el resultado ya realizado de las cerradas
  // quedaba fuera y el tablero mostraba dos porcentajes distintos de lo mismo
  // (+10,6% arriba y +10,3% abajo).
  it('la tabla y la serie usan el mismo capital invertido', () => {
    const { totals } = buildPositionRows(snapshot, { scope: 'all', usdMode: 'real' });
    expect(totals.invested).toBeCloseTo(last.invested, 6);
  });

  it('sin índice elegido el benchmark queda en cero', () => {
    const sinIndice = buildSeries(snapshot, {
      scope: 'all',
      usdMode: 'real',
      benchmark: 'none',
    }).points.at(-1)!;
    expect(sinIndice.benchmark).toBe(0);
  });

  it('el benchmark también registra la salida del sábado', () => {
    // Entró 100.000 y salió 110.000 al mismo precio del ETF: queda en cero.
    expect(last.benchmark).toBeCloseTo(0, 6);
  });
});

describe('las dos cajas', () => {
  // Una venta del viernes todavía liquidando y unos centavos de dividendo en
  // la caja en dólares.
  const price = (yahoo_ticker: string, price_date: string, close: number) => ({
    yahoo_ticker,
    price_date,
    close,
    adj_close: null,
    low: close - 1,
    high: close + 1,
  });

  const snapshot = {
    assets: [],
    trades: [],
    prices: [price('CLP=X', '2026-09-11', 945), price('CLP=X', '2026-09-12', 950)],
    dividends: [],
    benchmarkDividends: [],
    fxTrades: [],
    positions: [],
  };

  const balances = [
    { market: 'cl' as const, cash: 5000, buying_power: null, investments: null, pending_settlement: 300000 },
    { market: 'us' as const, cash: 0.24, buying_power: 0.24, investments: null, pending_settlement: 0 },
  ];

  const cash = buildCashBalance(snapshot, balances);

  it('cuenta el pendiente de liquidar como caja en pesos', () => {
    expect(cash.clp).toBe(305000);
  });

  it('convierte los dólares al precio de venta, no al mid', () => {
    // 950 de mid menos los 10 de spread.
    expect(cash.sell).toBe(940);
    expect(cash.usdInClp).toBeCloseTo(225.6, 6);
  });

  it('suma las dos cajas en pesos', () => {
    expect(cash.total).toBeCloseTo(305225.6, 6);
  });

  it('no mete el pendiente del mercado gringo en la caja en pesos', () => {
    const conPendienteUsd = buildCashBalance(snapshot, [
      balances[0],
      { ...balances[1], pending_settlement: 100 },
    ]);
    expect(conPendienteUsd.clp).toBe(305000);
    expect(conPendienteUsd.usd).toBeCloseTo(100.24, 6);
  });

  it('no inventa una conversión cuando no hay tipo de cambio', () => {
    const sinFx = buildCashBalance({ ...snapshot, prices: [] }, balances);
    expect(sinFx.usdInClp).toBe(0);
    expect(sinFx.total).toBe(305000);
  });
});

describe('precios de respaldo de la corredora', () => {
  // Yahoo deja de publicar sesiones de papeles chilenos poco líquidos por
  // semanas, repitiendo el mismo cierre con low = high. La corredora sí tiene
  // el precio, y esas filas llegan marcadas con source 'zesty'.
  const px = (price_date: string, close: number, real: boolean, source?: 'yahoo' | 'zesty') => ({
    yahoo_ticker: 'XYZ.SN',
    price_date,
    close,
    adj_close: null,
    low: real ? close - 50 : close,
    high: real ? close + 50 : close,
    ...(source ? { source } : {}),
  });

  const base = {
    assets: [],
    trades: [],
    dividends: [],
    benchmarkDividends: [],
    fxTrades: [],
    positions: [],
  };

  it('sin respaldo, compara contra la ultima sesion real y no la llama del dia', () => {
    const q = quote(
      { ...base, prices: [px('2026-07-17', 5860.4, true), px('2026-09-11', 5860.4, false), px('2026-09-14', 7888, true)] },
      'XYZ.SN',
    );
    expect(q.close).toBe(7888);
    // Casi dos meses de salto: no es la variacion de un dia.
    expect(q.isDaily).toBe(false);
    expect(q.prevDate).toBe('2026-07-17');
  });

  it('con el cierre de la corredora, la comparacion vuelve a ser de un dia', () => {
    const q = quote(
      {
        ...base,
        prices: [
          px('2026-07-17', 5860.4, true),
          // Yahoo sigue arrastrando, pero la corredora aporta el cierre real.
          px('2026-09-11', 8011.1, false, 'zesty'),
          px('2026-09-14', 7888, true),
        ],
      },
      'XYZ.SN',
    );
    expect(q.close).toBe(7888);
    expect(q.prevDate).toBe('2026-09-11');
    expect(q.isDaily).toBe(true);
    expect(q.changePct).toBeCloseTo(7888 / 8011.1 - 1, 9);
  });

  it('trata una fila sin marca como relleno de Yahoo', () => {
    const q = quote(
      {
        ...base,
        prices: [
          px('2026-07-17', 5860.4, true),
          // Mismo cierre que la fila 'zesty' del test anterior, pero sin marca.
          px('2026-09-11', 8011.1, false),
          px('2026-09-14', 7888, true),
        ],
      },
      'XYZ.SN',
    );
    // Se salta el 11-sep y vuelve a comparar contra julio.
    expect(q.prevDate).toBe('2026-07-17');
    expect(q.isDaily).toBe(false);
  });
});

describe('flujos hacia el benchmark', () => {
  const flows = tradesToFlows(TRADES, FX_TRADES);

  it('convierte la compra en dólares a los pesos que costó', () => {
    const usx = flows.find((f) => f.date === '2026-04-10')!;
    expect(usx.clp).toBeCloseTo(401.2 * 960, 6);
  });

  it('registra las ventas como salidas', () => {
    const venta = flows.find((f) => f.date === '2026-03-02')!;
    expect(venta.clp).toBeLessThan(0);
  });

  it('entrega los flujos en orden cronológico', () => {
    const dates = flows.map((f) => f.date);
    expect([...dates].sort()).toEqual(dates);
  });
});
