#!/usr/bin/env node
/**
 * Arma el tablero: lee las respuestas del MCP de Zesty guardadas en
 * `data/zesty/`, suma lo cargado a mano en `data/manual.json`, trae los precios
 * de Yahoo y escribe `public/data/snapshot.json`, que es lo único que lee la app.
 *
 *   node scripts/snapshot.mjs                 # tu cartera (carpeta data/)
 *   node scripts/snapshot.mjs --datos ejemplo # la cartera ficticia de demo
 *
 * No necesita credenciales de nada. Todo queda en tu computador.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fechaChile, leerZesty, tickerYahoo } from './lib/zesty.mjs';
import { serieYahoo } from './lib/yahoo.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(nombre);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};

const datos = resolve(raiz, opcion('--datos', 'data'));
const salida = resolve(raiz, opcion('--salida', 'public/data/snapshot.json'));
const esDemo = args.includes('--demo');

const FX_TICKER = 'CLP=X';
const SP500_TICKER = '^SP500TR';
/** El ETF del IPSA contra el que se compara la cartera. */
const BENCHMARK = { symbol: 'CFMITNIPSA', name: 'Itaú ETF IT Now S&P IPSA', asset_type: 'ETF' };

const hoy = fechaChile(new Date().toISOString());
const avisos = [];

// ------------------------------------------------------------------ lectura ---

const zesty = leerZesty(join(datos, 'zesty'));

const manualPath = join(datos, 'manual.json');
const manual = existsSync(manualPath)
  ? JSON.parse(readFileSync(manualPath, 'utf8').replace(/^﻿/, ''))
  : {};

/** Operaciones fuera de Zesty (traspasos desde otra corredora), validadas. */
const externas = (manual.trades ?? []).map((t, i) => {
  const faltan = ['symbol', 'market', 'side', 'executed_at', 'qty', 'price'].filter(
    (k) => t[k] === undefined || t[k] === null,
  );
  if (faltan.length) throw new Error(`manual.json, trades[${i}]: faltan ${faltan.join(', ')}`);
  const qty = Number(t.qty);
  const price = Number(t.price);
  const gross = t.gross_amount !== undefined ? Number(t.gross_amount) : qty * price;
  const commission = Number(t.commission ?? 0);
  const vat = Number(t.vat ?? 0);
  return {
    id: String(t.id ?? `externa-${i + 1}-${t.symbol}`),
    source: 'externa',
    symbol: String(t.symbol),
    market: t.market === 'us' ? 'us' : 'cl',
    side: t.side === 'sell' ? 'sell' : 'buy',
    executed_at: String(t.executed_at).length === 10 ? `${t.executed_at}T16:00:00Z` : String(t.executed_at),
    qty,
    price,
    gross_amount: gross,
    commission,
    vat,
    net_amount:
      t.net_amount !== undefined
        ? Number(t.net_amount)
        : t.side === 'sell'
          ? gross - commission - vat
          : gross + commission + vat,
    currency: t.market === 'us' ? 'USD' : 'CLP',
    note: t.note ?? null,
  };
});

const trades = [...zesty.trades, ...externas].sort((a, b) => a.executed_at.localeCompare(b.executed_at));

// Sin datos no se escribe nada: un tablero vacío confunde más que el mensaje de
// la app, que dice exactamente qué hacer.
if (!trades.length && !zesty.positions.length) {
  console.log(
    `No hay datos de Zesty en ${join(datos, 'zesty')}.\n` +
      'Pídele a tu agente «sincroniza mi cartera de Zesty» (ver AGENTS.md) o prueba con `npm run demo`.',
  );
  process.exit(1);
}

// ------------------------------------------------------------------ activos ---

const assets = new Map();
const agregarActivo = (symbol, market) => {
  if (assets.has(symbol)) return;
  const info = zesty.nombres.get(symbol);
  assets.set(symbol, {
    symbol,
    market,
    name: info?.name ?? symbol,
    asset_type: info?.asset_type ?? 'Stock',
    yahoo_ticker: tickerYahoo(symbol, market),
    currency: market === 'us' ? 'USD' : 'CLP',
    is_benchmark: false,
    syncs_prices: true,
  });
};
for (const t of trades) agregarActivo(t.symbol, t.market);
for (const p of zesty.positions) agregarActivo(p.symbol, p.market);
for (const d of zesty.dividends) agregarActivo(d.symbol, d.market);
if (!assets.has(BENCHMARK.symbol)) {
  assets.set(BENCHMARK.symbol, {
    ...BENCHMARK,
    market: 'cl',
    yahoo_ticker: `${BENCHMARK.symbol}.SN`,
    currency: 'CLP',
    is_benchmark: false,
    syncs_prices: true,
  });
}
assets.get(BENCHMARK.symbol).is_benchmark = true;

// Correcciones a mano: un ticker de Yahoo distinto, un nombre, o marcar que no
// hay serie (se valoriza a costo y no se cuenta como falla).
for (const o of manual.assets ?? []) {
  const a = assets.get(o.symbol);
  if (a) Object.assign(a, o);
}

// ------------------------------------------------------------------ precios ---

const primerDia = trades.length ? trades[0].executed_at.slice(0, 10) : hoy;

const tickers = [
  ...new Set([...[...assets.values()].filter((a) => a.syncs_prices !== false).map((a) => a.yahoo_ticker), FX_TICKER, SP500_TICKER]),
];

const yahoo = new Map(); // ticker → filas
const fallidos = {};
const cola = [...tickers];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cola.length) {
      const ticker = cola.shift();
      try {
        yahoo.set(ticker, await serieYahoo(ticker, primerDia));
      } catch (e) {
        fallidos[ticker] = e instanceof Error ? e.message : String(e);
      }
    }
  }),
);

for (const a of assets.values()) {
  if (a.syncs_prices !== false && fallidos[a.yahoo_ticker]) {
    a.syncs_prices = false;
    avisos.push(
      `Yahoo no tiene ${a.yahoo_ticker} (${fallidos[a.yahoo_ticker]}): ${a.symbol} se valoriza con el precio de Zesty o a costo.`,
    );
  }
}

/** Una barra es una sesión de verdad si tuvo rango y no es relleno de volumen 0. */
const sesionReal = (r) =>
  r.low !== null && r.high !== null && r.low !== r.high && !(r.volume === 0 && r.yahoo_ticker.endsWith('.SN'));

// Precios de la corredora: lo único que no se puede recuperar después. Yahoo
// deja de publicar sesiones de los papeles chilenos poco líquidos por semanas;
// Zesty sabe el precio de cada día, así que se anota y se guarda.
const historialPath = join(datos, 'precios-corredora.json');
const historial = new Map(
  (existsSync(historialPath) ? JSON.parse(readFileSync(historialPath, 'utf8')) : []).map((r) => [
    `${r.yahoo_ticker}|${r.price_date}`,
    r,
  ]),
);
if (zesty.syncedAt) {
  const diaSync = fechaChile(zesty.syncedAt);
  for (const p of zesty.preciosCorredora) {
    const a = assets.get(p.symbol);
    if (!a) continue;
    let fecha = diaSync;
    if (p.cuando === 'ayer') {
      // La sesión anterior: la última fecha con fila de Yahoo antes del día del sync.
      const previas = (yahoo.get(a.yahoo_ticker) ?? []).filter((r) => r.price_date < diaSync);
      fecha = previas.at(-1)?.price_date;
      if (!fecha) continue;
    }
    historial.set(`${a.yahoo_ticker}|${fecha}`, {
      yahoo_ticker: a.yahoo_ticker,
      symbol: p.symbol,
      price_date: fecha,
      close: p.close,
    });
  }
}
if (historial.size) {
  writeFileSync(
    historialPath,
    JSON.stringify([...historial.values()].sort((a, b) => (a.yahoo_ticker + a.price_date).localeCompare(b.yahoo_ticker + b.price_date)), null, 1),
  );
}

// Mezcla: manda Yahoo cuando publicó una sesión de verdad; si lo que hay es
// relleno y la corredora tiene precio ese día, gana la corredora. La fila es
// entera de una fuente o de la otra, nunca mezclada.
const prices = [];
const corredoraPor = new Map();
for (const r of historial.values()) {
  if (r.price_date < primerDia) continue;
  if (!corredoraPor.has(r.yahoo_ticker)) corredoraPor.set(r.yahoo_ticker, new Map());
  corredoraPor.get(r.yahoo_ticker).set(r.price_date, r.close);
}
for (const ticker of new Set([...yahoo.keys(), ...corredoraPor.keys()])) {
  const filasY = new Map((yahoo.get(ticker) ?? []).map((r) => [r.price_date, r]));
  const filasC = corredoraPor.get(ticker) ?? new Map();
  for (const fecha of new Set([...filasY.keys(), ...filasC.keys()])) {
    const y = filasY.get(fecha);
    const c = filasC.get(fecha);
    if (y && (sesionReal(y) || c === undefined)) {
      const real = sesionReal(y);
      prices.push({
        yahoo_ticker: ticker,
        price_date: fecha,
        close: y.close,
        adj_close: y.adj_close,
        // Una barra de relleno viaja con low = high para que el tablero no la
        // llame «variación del día».
        low: real ? y.low : y.close,
        high: real ? y.high : y.close,
        source: 'yahoo',
      });
    } else if (c !== undefined) {
      prices.push({ yahoo_ticker: ticker, price_date: fecha, close: c, adj_close: null, low: null, high: null, source: 'zesty' });
    }
  }
}
prices.sort((a, b) => (a.yahoo_ticker + a.price_date).localeCompare(b.yahoo_ticker + b.price_date));

// ------------------------------------------------------ dividendos del índice ---

/**
 * Dividendos por cuota del ETF del IPSA. Yahoo no los publica, así que salen
 * de `manual.json` o, si tuviste el ETF, de tus propios cobros divididos por
 * las cuotas que tenías ese día. Sin ninguna de las dos fuentes, el índice se
 * compara solo por precio (le juega un poco en contra).
 */
let benchmarkDividends = manual.benchmarkDividends ?? null;
if (!benchmarkDividends) {
  benchmarkDividends = [];
  for (const d of zesty.dividends.filter((x) => x.symbol === BENCHMARK.symbol)) {
    const cuotas = trades
      .filter((t) => t.symbol === BENCHMARK.symbol && t.executed_at.slice(0, 10) <= d.paid_at)
      .reduce((s, t) => s + (t.side === 'buy' ? t.qty : -t.qty), 0);
    if (cuotas > 0) benchmarkDividends.push({ ex_date: d.paid_at, amount_per_unit: d.amount / cuotas });
  }
}

// ------------------------------------------------------------ verificación ---

/**
 * Las posiciones del tablero se reconstruyen desde las operaciones. Si no
 * cuadran con lo que reporta Zesty, falta historial: casi siempre papeles
 * traspasados desde otra corredora, que se cargan en `manual.json`.
 */
const tenencia = new Map();
for (const t of trades) {
  const v = (tenencia.get(t.symbol) ?? 0) + (t.side === 'buy' ? t.qty : -t.qty);
  tenencia.set(t.symbol, Math.abs(v) < 1e-9 ? 0 : v);
}
const descuadres = [];
for (const p of zesty.positions) {
  const reconstruida = tenencia.get(p.symbol) ?? 0;
  if (Math.abs(reconstruida - p.qty) > 1e-6) {
    descuadres.push({ symbol: p.symbol, market: p.market, zesty: p.qty, operaciones: reconstruida, avg_price: p.avg_price });
  }
}
for (const [symbol, qty] of tenencia) {
  if (qty > 1e-6 && !zesty.positions.some((p) => p.symbol === symbol) && zesty.positions.length) {
    descuadres.push({ symbol, market: assets.get(symbol)?.market, zesty: 0, operaciones: qty, avg_price: null });
  }
}
for (const d of descuadres) {
  avisos.push(
    `${d.symbol}: Zesty reporta ${d.zesty} y las operaciones suman ${d.operaciones}. ` +
      (d.zesty > d.operaciones
        ? `Faltan ${d.zesty - d.operaciones} en el historial (¿traspaso desde otra corredora?): cárgalas en manual.json a ${d.avg_price}.`
        : 'Sobran en el historial: revisa ventas que falten o compras repetidas en manual.json.'),
  );
}

// ------------------------------------------------------------------ salida ---

const snapshot = {
  demo: esDemo,
  generated_at: new Date().toISOString(),
  assets: [...assets.values()].sort((a, b) => a.symbol.localeCompare(b.symbol)),
  trades,
  prices,
  dividends: zesty.dividends.sort((a, b) => a.paid_at.localeCompare(b.paid_at)),
  benchmarkDividends,
  fxTrades: zesty.fxTrades.sort((a, b) => a.executed_at.localeCompare(b.executed_at)),
  positions: zesty.positions.sort((a, b) => a.symbol.localeCompare(b.symbol)),
  balances: zesty.balances,
  cashMovements: zesty.cashMovements.sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at))),
  syncs: {
    yahoo: {
      source: 'yahoo',
      ran_at: new Date().toISOString(),
      status: Object.keys(fallidos).length === 0 ? 'ok' : yahoo.size ? 'partial' : 'error',
    },
    ...(zesty.syncedAt ? { zesty: { source: 'zesty', ran_at: zesty.syncedAt, status: 'ok' } } : {}),
  },
  descuadres,
};

mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, JSON.stringify(snapshot));

const rel = (p) => p.replace(raiz, '.').replaceAll('\\', '/');
console.log(
  `${rel(salida)}: ${trades.length} operaciones, ${zesty.positions.length} posiciones, ` +
    `${zesty.dividends.length} dividendos, ${prices.length} precios (${yahoo.size}/${tickers.length} tickers de Yahoo).`,
);
for (const a of avisos) console.log(`AVISO: ${a}`);
