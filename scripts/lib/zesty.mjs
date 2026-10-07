/**
 * Convierte las respuestas crudas del MCP de Zesty en las tablas que lee el
 * tablero.
 *
 * El agente guarda cada respuesta tal cual en `data/zesty/` (ver AGENTS.md) y
 * todo el trabajo de interpretarlas vive aquí, en código, no en el agente: así
 * la conversión es la misma cada vez y se puede revisar.
 *
 * Lo que NUNCA sale de aquí: RUT, ids de usuario, hashes bancarios ni nombres.
 * Se lee solo lo que el tablero necesita y el resto se ignora.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Fecha local de Santiago (YYYY-MM-DD) de una marca de tiempo. */
export function fechaChile(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function leerJson(path) {
  const texto = readFileSync(path, 'utf8').replace(/^﻿/, '');
  try {
    return JSON.parse(texto);
  } catch (e) {
    throw new Error(`${path} no es JSON válido: ${e.message}`);
  }
}

/** Todos los archivos `<prefijo>*.json` de la carpeta, ordenados. */
function archivos(dir, prefijo) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(prefijo) && f.endsWith('.json'))
    .sort()
    .map((f) => join(dir, f));
}

/** Las filas de una respuesta, venga como `data`, `items` o un arreglo suelto. */
function filas(json) {
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.items)) return json.items;
  return [];
}

/** Valor de una línea de resumen de una orden chilena («Sub total», «Comisión»…). */
function linea(order, etiqueta) {
  const buscada = etiqueta.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  for (const l of order.summaryLines ?? []) {
    const nombre = String(l?.primaryValue?.value ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    if (nombre === buscada) return num(l?.secondaryValue?.value);
  }
  return null;
}

/** Ticker de Yahoo por defecto para un símbolo de Zesty. */
export function tickerYahoo(symbol, market) {
  if (market === 'cl') return `${symbol}.SN`;
  // Cripto: BTC/USD → BTC-USD. Clases de acciones: BRK.B → BRK-B.
  return symbol.replace('/', '-').replace('.', '-');
}

// ---------------------------------------------------------------- órdenes ---

function ordenChilena(o) {
  const qty = num(o.filledQty);
  if (!qty || qty <= 0) return null; // canceladas y expiradas no son operaciones

  const precio = num(o.price?.secondaryValue?.value) ?? null;
  const bruto = linea(o, 'Sub total') ?? (precio !== null ? precio * qty : null);
  const comision = linea(o, 'Comisión') ?? 0;
  const iva = linea(o, 'Iva') ?? 0;
  let neto = linea(o, 'Total') ?? num(o.filledTotal);
  if (bruto === null) return null;
  if (neto === null || neto === 0) {
    neto = o.side === 'sell' ? bruto - comision - iva : bruto + comision + iva;
  }

  return {
    id: String(o.orderUuid),
    source: 'zesty',
    symbol: String(o.symbol),
    market: 'cl',
    side: o.side === 'sell' ? 'sell' : 'buy',
    executed_at: o.updatedAt ?? o.createdAt,
    qty,
    price: precio ?? bruto / qty,
    gross_amount: bruto,
    commission: comision,
    vat: iva,
    net_amount: neto,
    currency: 'CLP',
    note: null,
  };
}

function ordenGringa(o) {
  const qty = num(o.filledQty);
  if (!qty || qty <= 0) return null;

  const precio = num(o.filledAvgPrice);
  const comision = num(o.commission) ?? 0;
  const bruto =
    num(o.filledTotalAmountWithoutCommission) ?? (precio !== null ? precio * qty : null);
  if (bruto === null) return null;
  const neto = o.side === 'sell' ? bruto - comision : bruto + comision;

  return {
    id: String(o.orderId ?? o.id),
    source: 'zesty',
    symbol: String(o.symbol),
    market: 'us',
    side: o.side === 'sell' ? 'sell' : 'buy',
    executed_at: o.filledAt ?? o.updatedAt ?? o.createdAt,
    qty,
    price: precio ?? bruto / qty,
    gross_amount: bruto,
    commission: comision,
    vat: 0,
    net_amount: neto,
    currency: 'USD',
    note: null,
  };
}

// ----------------------------------------------------------------- lectura ---

/**
 * Lee la carpeta de respuestas crudas y devuelve el estado de la cuenta.
 * Cada sección es opcional: si falta un archivo, esa parte queda vacía.
 */
export function leerZesty(dir) {
  const nombres = new Map(); // símbolo → { name, asset_type, market }
  const anotarActivo = (a, market) => {
    if (!a?.symbol && !a?.name) return;
    const symbol = a.symbol;
    if (symbol && !nombres.has(symbol)) {
      nombres.set(symbol, { name: a.name ?? symbol, asset_type: a.assetType ?? 'Stock', market });
    }
  };

  // Operaciones: historial cerrado y pendientes, sin repetir.
  const trades = new Map();
  for (const market of ['cl', 'us']) {
    for (const f of archivos(dir, `orders-${market}`)) {
      for (const o of filas(leerJson(f))) {
        if (o.asset) anotarActivo({ ...o.asset, symbol: o.symbol }, market);
        const t = market === 'cl' ? ordenChilena(o) : ordenGringa(o);
        if (t) trades.set(t.id, t);
      }
    }
  }

  // Posiciones y precios de la corredora.
  const positions = [];
  const preciosCorredora = []; // { symbol, market, close, cuando: 'hoy' | 'ayer' }
  for (const f of archivos(dir, 'positions-cl')) {
    for (const p of filas(leerJson(f))) {
      anotarActivo({ ...p.asset, symbol: p.symbol }, 'cl');
      positions.push({
        symbol: p.symbol,
        market: 'cl',
        qty: num(p.qty) ?? 0,
        avg_price: num(p.avgPrice) ?? 0,
        current_price: num(p.currentPrice),
        market_value: num(p.marketValue),
        cost_basis: num(p.costBasis),
        unrealized_pl: num(p.unrealizedPl),
        currency: 'CLP',
      });
      if (num(p.currentPrice)) preciosCorredora.push({ symbol: p.symbol, market: 'cl', close: num(p.currentPrice), cuando: 'hoy' });
      if (num(p.lastDayPrice)) preciosCorredora.push({ symbol: p.symbol, market: 'cl', close: num(p.lastDayPrice), cuando: 'ayer' });
    }
  }
  for (const f of archivos(dir, 'positions-us')) {
    for (const p of filas(leerJson(f))) {
      anotarActivo({ ...p.asset, symbol: p.symbol }, 'us');
      const precio = num(p.asset?.price) ?? num(p.currentPrice);
      positions.push({
        symbol: p.symbol,
        market: 'us',
        qty: num(p.quantity ?? p.qty) ?? 0,
        avg_price: num(p.avgBuyPrice ?? p.avgPrice) ?? 0,
        current_price: precio,
        market_value: num(p.totalValue ?? p.marketValue),
        cost_basis: num(p.cost ?? p.costBasis),
        unrealized_pl: num(p.variation ?? p.unrealizedPl),
        currency: 'USD',
      });
      if (precio) preciosCorredora.push({ symbol: p.symbol, market: 'us', close: precio, cuando: 'hoy' });
    }
  }

  // Caja.
  const balances = [];
  for (const market of ['cl', 'us']) {
    const f = archivos(dir, `balance-${market}`)[0];
    if (!f) continue;
    const b = leerJson(f);
    balances.push({
      market,
      // Lo ya liquidado. Lo que está liquidando va aparte para no contarlo dos veces.
      cash: num(market === 'cl' ? (b.cashWithdrawable ?? b.cash ?? b.balance) : (b.cash ?? b.cashWithdrawable)) ?? 0,
      buying_power: num(b.buyingPower),
      investments: num(b.investments),
      pending_settlement: num(b.pendingSettlement) ?? 0,
    });
  }

  // Dividendos. En EE.UU. la retención (DIVNRA) llega como una fila negativa
  // aparte: se netea contra el dividendo del mismo papel y día.
  const dividends = new Map();
  for (const market of ['cl', 'us']) {
    for (const f of archivos(dir, `dividends-${market}`)) {
      for (const d of filas(leerJson(f))) {
        if (d.asset) anotarActivo({ ...d.asset, symbol: d.symbol }, market);
        const amount = num(d.amount);
        if (amount === null) continue;
        const paid_at = fechaChile(d.date ?? d.paidAt);
        const clave = market === 'us' ? `us|${d.symbol}|${paid_at}` : `cl|${d.dividendId}`;
        const prev = dividends.get(clave);
        if (prev) {
          prev.amount += amount;
          if (d.entryType === 'DIV') prev.id = String(d.dividendId);
        } else {
          dividends.set(clave, {
            id: String(d.dividendId ?? clave),
            symbol: d.symbol,
            market,
            paid_at,
            amount,
            currency: market === 'us' ? 'USD' : 'CLP',
          });
        }
      }
    }
  }

  // Aportes y retiros. Solo los que ya llegaron.
  const cashMovements = new Map();
  const entregado = (s) => !s || ['delivered', 'done', 'completed', 'completado'].includes(String(s).toLowerCase());
  for (const f of archivos(dir, 'movements')) {
    const json = leerJson(f);
    const grupos = [];
    if (json.deposits || json.withdrawals) {
      grupos.push(['deposit', filas(json.deposits)], ['withdrawal', filas(json.withdrawals)]);
    } else {
      grupos.push([/withdrawal|retiro/i.test(f) ? 'withdrawal' : 'deposit', filas(json)]);
    }
    for (const [kind, rows] of grupos) {
      for (const m of rows) {
        if (!entregado(m.status)) continue;
        const id = String(m.ulid ?? m.hash ?? m.id ?? `${kind}-${m.createdAt}`);
        cashMovements.set(id, {
          id,
          kind,
          occurred_at: m.createdAt ?? m.bankDate ?? m.updatedAt,
          amount: Math.abs(num(m.executedAmount ?? m.amount) ?? 0),
          currency: m.currency ?? 'CLP',
        });
      }
    }
  }

  // Cambios de moneda: historial y pendientes, sin repetir.
  const fxTrades = new Map();
  const fallido = (s) => /cancel|reject|fail|expired/i.test(String(s ?? ''));
  for (const f of [...archivos(dir, 'fx-history'), ...archivos(dir, 'pending-fx')]) {
    for (const x of filas(leerJson(f))) {
      if (fallido(x.status)) continue;
      const clp = num(x.amount);
      const usd = num(x.amountInUsd);
      const rate = num(x.usdToClp);
      if (!x.fxId || clp === null || usd === null) continue;
      fxTrades.set(String(x.fxId), {
        id: String(x.fxId),
        side: x.side === 'sell' ? 'sell' : 'buy',
        executed_at: x.createdAt,
        clp_amount: clp,
        usd_amount: usd,
        rate: rate ?? clp / usd,
        spot_rate: null,
      });
    }
  }

  // Cuándo se sincronizó: `sync.json` si el agente lo dejó; si no, el archivo
  // de posiciones más nuevo.
  let syncedAt = null;
  const syncFile = join(dir, 'sync.json');
  if (existsSync(syncFile)) syncedAt = leerJson(syncFile).synced_at ?? null;
  if (!syncedAt) {
    const mtimes = [...archivos(dir, 'positions-'), ...archivos(dir, 'balance-')].map((f) => statSync(f).mtimeMs);
    if (mtimes.length) syncedAt = new Date(Math.max(...mtimes)).toISOString();
  }

  return {
    trades: [...trades.values()],
    positions,
    balances,
    dividends: [...dividends.values()],
    cashMovements: [...cashMovements.values()],
    fxTrades: [...fxTrades.values()],
    nombres,
    preciosCorredora,
    syncedAt,
  };
}
