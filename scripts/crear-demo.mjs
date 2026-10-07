#!/usr/bin/env node
/**
 * Genera la cartera FICTICIA de `ejemplo/`: respuestas con la misma forma que
 * las del MCP de Zesty, armadas sobre precios reales de Yahoo para que los
 * números se vean creíbles. Ningún dato es de una persona real.
 *
 *   node scripts/crear-demo.mjs
 *
 * No hace falta correrlo para usar el demo: el resultado ya viene en el repo.
 * Sirve para regenerarlo y como ejemplo vivo del formato que espera el
 * conversor (`scripts/lib/zesty.mjs`).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serieYahoo } from './lib/yahoo.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(raiz, 'ejemplo', 'zesty');
mkdirSync(dir, { recursive: true });

const NOMBRES = {
  CFMITNIPSA: ['Itaú ETF IT Now S&P IPSA', 'ETF'],
  'SQM-B': ['Sociedad Química y Minera de Chile S.A.', 'Stock'],
  FALABELLA: ['Falabella S.A.', 'Stock'],
  CENCOSUD: ['Cencosud S.A.', 'Stock'],
  COPEC: ['Empresas Copec S.A.', 'Stock'],
  AAPL: ['Apple Inc.', 'Stock'],
  VOO: ['Vanguard S&P 500 ETF', 'ETF'],
};

const yahooDe = (s, m) => (m === 'cl' ? `${s}.SN` : s);
const series = new Map();
async function precio(symbol, market, fecha) {
  const t = yahooDe(symbol, market);
  if (!series.has(t)) series.set(t, await serieYahoo(t, '2025-09-01'));
  const filas = series.get(t).filter((r) => r.price_date <= fecha);
  if (!filas.length) throw new Error(`sin precio de ${t} al ${fecha}`);
  return filas.at(-1).close;
}
async function mid(fecha) {
  return precio('CLP=X', 'us', fecha);
}

let n = 0;
const id = () => {
  n++;
  const h = n.toString(16).padStart(8, '0');
  return `00000000-0000-4000-8000-${h.padStart(12, '0')}`;
};
const linea = (etiqueta, valor) => ({
  primaryValue: { value: etiqueta, color: 'primary', bold: false },
  secondaryValue: { value: valor, color: 'primary', bold: true },
});
const asset = (symbol, extra = {}) => ({
  name: NOMBRES[symbol][0],
  symbol,
  assetType: NOMBRES[symbol][1],
  ...extra,
});

const ordenesCl = [];
const ordenesUs = [];
const dividendosCl = [];
const dividendosUs = [];
const depositos = [];
const retiros = [];
const fx = [];
let cajaClp = 0;
let cajaUsd = 0;
const tenencia = new Map(); // symbol → { qty, costo, market }

function mover(symbol, market, qty, costo) {
  const t = tenencia.get(symbol) ?? { qty: 0, costo: 0, market };
  if (qty > 0) {
    t.qty += qty;
    t.costo += costo;
  } else {
    const prop = -qty / t.qty;
    t.costo -= t.costo * prop;
    t.qty += qty;
  }
  tenencia.set(symbol, t);
}

function deposito(fecha, monto) {
  depositos.push({ ulid: `DEMO${String(depositos.length + 1).padStart(22, '0')}`, status: 'delivered', createdAt: `${fecha}T10:00:00`, amount: monto });
  cajaClp += monto;
}
function retiro(fecha, monto) {
  retiros.push({ hash: `demo-retiro-${retiros.length + 1}`, currency: 'CLP', status: 'delivered', createdAt: `${fecha}T12:00:00.000Z`, amount: monto, executedAmount: monto });
  cajaClp -= monto;
}

async function operacionCl(fecha, side, symbol, objetivoClp) {
  const p = await precio(symbol, 'cl', fecha);
  const qty = side === 'buy' ? Math.floor(objetivoClp / p) : objetivoClp; // en ventas, objetivo = acciones
  const bruto = Math.round(qty * p * 100) / 100;
  const comision = Math.round(bruto * 0.0015);
  const iva = Math.round(comision * 0.19);
  const total = side === 'buy' ? bruto + comision + iva : bruto - comision - iva;
  ordenesCl.push({
    orderUuid: id(),
    side,
    orderType: 'limit',
    createdAt: `${fecha}T14:00:00.000Z`,
    updatedAt: `${fecha}T14:02:10.000Z`,
    symbol,
    filledQty: qty,
    filledTotal: total,
    limitPrice: p,
    total,
    price: { primaryValue: { value: 'Precio promedio' }, secondaryValue: { value: p } },
    qty: { primaryValue: { value: side === 'buy' ? 'Acciones compradas' : 'Acciones vendidas' }, secondaryValue: { value: `${qty}/${qty}` } },
    summaryLines: [linea('Sub total', bruto), linea('Comisión', comision), linea('Iva', iva), linea('Total', total)],
    status: 'Completada',
    asset: asset(symbol, { exchange: 'BCS' }),
  });
  cajaClp += side === 'buy' ? -total : total;
  mover(symbol, 'cl', side === 'buy' ? qty : -qty, bruto);
}

async function compraDolares(fecha, clp) {
  const tasa = Math.round(((await mid(fecha)) + 10) * 100) / 100;
  const usd = Math.round((clp / tasa) * 10000) / 10000;
  fx.push({ fxId: id(), side: 'buy', usdToClp: tasa, status: 'delivered', createdAt: `${fecha}T15:00:00.000Z`, updatedAt: `${fecha}T15:00:05.000Z`, amount: clp, amountInUsd: usd });
  cajaClp -= clp;
  cajaUsd += usd;
}

async function compraUs(fecha, symbol, usd) {
  const p = await precio(symbol, 'us', fecha);
  const comision = Math.round(usd * 0.003 * 100) / 100;
  const neto = usd - comision;
  const qty = Math.round((neto / p) * 1e9) / 1e9;
  const bruto = Math.round(qty * p * 100) / 100;
  ordenesUs.push({
    symbol,
    side: 'buy',
    status: 'Completada',
    qty: null,
    orderClass: '',
    orderId: id(),
    type: 'market',
    createdAt: `${fecha}T15:30:00Z`,
    notional: String(usd),
    timeInForce: 'day',
    filledQty: String(qty),
    filledAvgPrice: String(p),
    commission: String(comision),
    filledTotalAmount: String(Math.round((bruto + comision) * 100) / 100),
    filledTotalAmountWithoutCommission: String(bruto),
    asset: asset(symbol),
  });
  cajaUsd -= bruto + comision;
  mover(symbol, 'us', qty, bruto);
}

function dividendoCl(fecha, symbol, porAccion) {
  const qty = tenencia.get(symbol)?.qty ?? 0;
  const monto = Math.round(qty * porAccion);
  dividendosCl.push({ dividendId: id(), symbol, amount: monto, date: `${fecha}T04:00:00.000Z`, asset: asset(symbol, { exchange: 'BCS' }) });
  cajaClp += monto;
}
function dividendoUs(fecha, symbol, porAccion) {
  const qty = tenencia.get(symbol)?.qty ?? 0;
  const bruto = Math.round(qty * porAccion * 100) / 100;
  const retencion = Math.round(bruto * 0.15 * 100) / 100;
  dividendosUs.push(
    { dividendId: `DEMO-DIV-${id()}`, symbol, entryType: 'DIV', amount: bruto, date: `${fecha}T14:00:00.000Z`, asset: asset(symbol) },
    { dividendId: `DEMO-NRA-${id()}`, symbol, entryType: 'DIVNRA', amount: -retencion, date: `${fecha}T14:00:01.000Z`, asset: asset(symbol) },
  );
  cajaUsd += bruto - retencion;
}

// ------------------------------------------------------------ la historia ---

// COPEC llegó traspasada desde otra corredora: no está en el historial de
// Zesty y se carga en ejemplo/manual.json.
const copecFecha = '2025-10-06';
const copecQty = 40;
const copecPrecio = await precio('COPEC', 'cl', copecFecha);
mover('COPEC', 'cl', copecQty, copecQty * copecPrecio);

deposito('2025-11-20', 1_200_000);
await operacionCl('2025-11-21', 'buy', 'CFMITNIPSA', 420_000);
await operacionCl('2025-12-10', 'buy', 'SQM-B', 300_000);
await operacionCl('2026-01-15', 'buy', 'FALABELLA', 250_000);
deposito('2026-03-04', 300_000);
await operacionCl('2026-03-05', 'buy', 'CENCOSUD', 200_000);
deposito('2026-04-09', 250_000);
await compraDolares('2026-04-10', 400_000);
await compraUs('2026-04-10', 'AAPL', 230);
await compraUs('2026-04-10', 'VOO', 180);
dividendoCl('2026-05-07', 'CFMITNIPSA', 14);
dividendoCl('2026-05-14', 'CFMITNIPSA', 18);
dividendoCl('2026-05-12', 'CENCOSUD', 42);
dividendoCl('2026-05-20', 'FALABELLA', 31);
dividendoUs('2026-05-15', 'AAPL', 0.26);
await operacionCl('2026-06-18', 'sell', 'SQM-B', Math.floor((tenencia.get('SQM-B')?.qty ?? 0) / 2));
dividendoUs('2026-08-14', 'AAPL', 0.26);
retiro('2026-08-05', 100_000);
await compraDolares('2026-09-02', 70_000);
await compraUs('2026-09-02', 'VOO', 60);
dividendoUs('2026-09-30', 'VOO', 1.74);

// ------------------------------------------------------------ fotografía ---

const hoy = new Date().toISOString().slice(0, 10);
const posicionesCl = [];
const posicionesUs = [];
for (const [symbol, t] of tenencia) {
  if (t.qty <= 1e-9) continue;
  const p = await precio(symbol, t.market, hoy);
  if (t.market === 'cl') {
    const filas = series.get(yahooDe(symbol, 'cl'));
    const ayer = filas.at(-2)?.close ?? p;
    posicionesCl.push({
      symbol,
      qty: t.qty,
      qtyAvailable: t.qty,
      avgPrice: Math.round((t.costo / t.qty) * 1e6) / 1e6,
      side: 'long',
      currentPrice: p,
      marketValue: Math.round(t.qty * p * 100) / 100,
      costBasis: Math.round(t.costo * 100) / 100,
      unrealizedPl: Math.round((t.qty * p - t.costo) * 100) / 100,
      lastDayPrice: ayer,
      asset: asset(symbol, { price: p }),
    });
  } else {
    posicionesUs.push({
      symbol,
      quantity: t.qty,
      totalValue: Math.round(t.qty * p * 1e6) / 1e6,
      cost: Math.round(t.costo * 100) / 100,
      variation: Math.round((t.qty * p - t.costo) * 1e6) / 1e6,
      avgBuyPrice: Math.round((t.costo / t.qty) * 1000) / 1000,
      asset: asset(symbol, { price: p }),
    });
  }
}

const escribir = (nombre, datos) => writeFileSync(join(dir, nombre), JSON.stringify(datos, null, 1) + '\n');
escribir('positions-cl.json', { items: posicionesCl });
escribir('positions-us.json', { items: posicionesUs });
escribir('orders-cl.json', { data: ordenesCl.reverse(), nextToken: null });
escribir('orders-us.json', { data: ordenesUs.reverse(), nextToken: null });
escribir('balance-cl.json', { cashWithdrawable: Math.round(cajaClp), pendingSettlement: 0, balance: Math.round(cajaClp) });
escribir('balance-us.json', { buyingPower: Math.round(cajaUsd * 100) / 100, cash: Math.round(cajaUsd * 100) / 100, cashWithdrawable: Math.round(cajaUsd * 100) / 100, pendingSettlement: 0 });
escribir('dividends-cl.json', { data: dividendosCl.reverse(), nextToken: null });
escribir('dividends-us.json', { data: dividendosUs.reverse(), nextToken: null });
escribir('movements.json', { deposits: { nextToken: null, data: depositos.reverse() }, withdrawals: { nextToken: null, data: retiros.reverse() } });
escribir('fx-history.json', { data: fx.reverse(), nextToken: null });
escribir('pending-fx.json', { items: [] });
escribir('sync.json', { synced_at: new Date().toISOString() });

writeFileSync(
  join(raiz, 'ejemplo', 'manual.json'),
  JSON.stringify(
    {
      trades: [
        {
          symbol: 'COPEC',
          market: 'cl',
          side: 'buy',
          executed_at: copecFecha,
          qty: copecQty,
          price: copecPrecio,
          note: 'ESTIMADO: traspaso desde otra corredora; fecha aproximada, precio = precio promedio que muestra Zesty',
        },
      ],
    },
    null,
    2,
  ) + '\n',
);

console.log(`ejemplo/ regenerado: ${ordenesCl.length + ordenesUs.length} órdenes, caja $${Math.round(cajaClp)} + US$${cajaUsd.toFixed(2)}`);
