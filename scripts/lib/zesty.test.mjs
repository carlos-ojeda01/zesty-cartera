import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { fechaChile, leerZesty, tickerYahoo } from './zesty.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('conversor del MCP con la cartera de ejemplo', () => {
  const z = leerZesty(join(raiz, 'ejemplo', 'zesty'));

  it('lee operaciones de los dos mercados', () => {
    expect(z.trades.some((t) => t.market === 'cl')).toBe(true);
    expect(z.trades.some((t) => t.market === 'us' && t.currency === 'USD')).toBe(true);
  });

  it('el neto de una compra chilena es bruto + comisión + IVA', () => {
    for (const t of z.trades.filter((x) => x.market === 'cl' && x.side === 'buy')) {
      expect(t.net_amount).toBeCloseTo(t.gross_amount + t.commission + t.vat, 6);
    }
  });

  it('netea la retención de EE.UU. contra el dividendo del mismo día', () => {
    const us = z.dividends.filter((d) => d.market === 'us');
    expect(us.length).toBeGreaterThan(0);
    for (const d of us) expect(d.amount).toBeGreaterThan(0);
  });

  it('las posiciones de Zesty cuadran con las operaciones (salvo el traspaso de manual.json)', () => {
    const tenencia = new Map();
    for (const t of z.trades) tenencia.set(t.symbol, (tenencia.get(t.symbol) ?? 0) + (t.side === 'buy' ? t.qty : -t.qty));
    for (const p of z.positions.filter((x) => x.symbol !== 'COPEC')) {
      expect(tenencia.get(p.symbol) ?? 0, p.symbol).toBeCloseTo(p.qty, 6);
    }
  });
});

describe('casos del formato real', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zesty-'));
  const escribir = (nombre, datos) => writeFileSync(join(dir, nombre), JSON.stringify(datos));

  escribir('orders-cl.json', {
    data: [
      // Cancelada: no es operación.
      { orderUuid: 'c1', side: 'sell', symbol: 'ABC', filledTotal: 0, status: 'Cancelada', summaryLines: [], updatedAt: '2026-09-11T14:12:32Z' },
      {
        orderUuid: 'v1',
        side: 'sell',
        symbol: 'ABC',
        filledQty: 10,
        updatedAt: '2026-09-11T14:13:27Z',
        price: { secondaryValue: { value: 4591.5 } },
        summaryLines: [
          { primaryValue: { value: 'Sub total' }, secondaryValue: { value: 45915 } },
          { primaryValue: { value: 'Comisión' }, secondaryValue: { value: 69 } },
          { primaryValue: { value: 'Iva' }, secondaryValue: { value: 13 } },
          { primaryValue: { value: 'Total' }, secondaryValue: { value: 45833 } },
        ],
      },
    ],
  });
  escribir('movements.json', {
    deposits: { data: [{ ulid: 'D1', userIdNumber: '11111111-1', hash: 'h', status: 'delivered', createdAt: '2026-03-03T09:49:23', amount: 100000 }] },
    withdrawals: { data: [{ hash: 'w1', userIdNumber: '11111111-1', status: 'rejected', createdAt: '2026-04-01T10:00:00Z', amount: 5000 }] },
  });
  escribir('dividends-us.json', {
    data: [
      { dividendId: 'A', symbol: 'XYZ', entryType: 'DIV', amount: 0.27, date: '2026-09-14T14:57:59Z' },
      { dividendId: 'B', symbol: 'XYZ', entryType: 'DIVNRA', amount: -0.04, date: '2026-09-14T14:57:50Z' },
    ],
  });
  const z = leerZesty(dir);

  it('solo cuenta órdenes con algo ejecutado y lee el resumen chileno', () => {
    expect(z.trades).toHaveLength(1);
    expect(z.trades[0]).toMatchObject({ side: 'sell', gross_amount: 45915, commission: 69, vat: 13, net_amount: 45833 });
  });

  it('descarta movimientos que no llegaron y no arrastra el RUT', () => {
    expect(z.cashMovements).toHaveLength(1);
    expect(JSON.stringify(z)).not.toContain('11111111-1');
  });

  it('deja un solo dividendo neto', () => {
    expect(z.dividends).toHaveLength(1);
    expect(z.dividends[0].amount).toBeCloseTo(0.23, 9);
    expect(z.dividends[0].id).toBe('A');
  });
});

describe('utilidades', () => {
  it('fecha los pagos chilenos en hora de Santiago', () => {
    // 04:00 UTC es medianoche en Chile en invierno: el pago es de ese día.
    expect(fechaChile('2026-05-20T04:00:00.926Z')).toBe('2026-05-20');
  });

  it('arma el ticker de Yahoo', () => {
    expect(tickerYahoo('SQM-B', 'cl')).toBe('SQM-B.SN');
    expect(tickerYahoo('BRK.B', 'us')).toBe('BRK-B');
    expect(tickerYahoo('BTC/USD', 'us')).toBe('BTC-USD');
  });
});
