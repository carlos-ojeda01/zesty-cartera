/**
 * Precios diarios desde Yahoo Finance. Sin API key: es el mismo endpoint que
 * usa su web.
 *
 * Tickers chilenos con sufijo `.SN`, tipo de cambio en `CLP=X`, S&P 500 de
 * retorno total en `^SP500TR`.
 */

const isoDate = (epochSeconds) => new Date(epochSeconds * 1000).toISOString().slice(0, 10);

/**
 * Serie diaria de un ticker desde `desde` (YYYY-MM-DD) hasta hoy.
 * Lanza si Yahoo no tiene el ticker o no responde.
 */
export async function serieYahoo(ticker, desde) {
  const period1 = Math.floor(Date.parse(desde + 'T00:00:00Z') / 1000) - 7 * 86400;
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${period2}&interval=1d`;

  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; zesty-cartera/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const chart = json?.chart;
  if (chart?.error) throw new Error(`${chart.error.code}: ${chart.error.description}`);

  const result = chart?.result?.[0];
  const meta = result?.meta ?? {};
  const stamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const adj = result?.indicators?.adjclose?.[0]?.adjclose ?? null;
  if (!stamps.length) throw new Error('sin puntos');

  // Yahoo fecha cada barra con el inicio de la sesión en la hora del mercado,
  // pero el timestamp viaja en UTC. Para el tipo de cambio el «mercado» es
  // Londres y la sesión parte a medianoche, que en horario de verano británico
  // son las 23:00 UTC del día anterior: sin corregirlo, medio año de dólares
  // quedaría fechado un día antes.
  const offset = typeof meta.gmtoffset === 'number' ? meta.gmtoffset : 0;
  const localDate = (s) => isoDate(s + offset);

  const byDate = new Map();
  for (let i = 0; i < stamps.length; i++) {
    const close = quote.close?.[i];
    if (close === null || close === undefined) continue; // días sin transacción
    const date = localDate(stamps[i]);
    byDate.set(date, {
      yahoo_ticker: ticker,
      price_date: date,
      close,
      adj_close: adj?.[i] ?? null,
      low: quote.low?.[i] ?? null,
      high: quote.high?.[i] ?? null,
      // Volumen 0 = barra de relleno en los .SN poco líquidos. Se guarda para
      // poder descartarla después; no viaja al tablero.
      volume: quote.volume?.[i] ?? null,
    });
  }

  // El precio en vivo manda sobre la barra del día en curso: Yahoo deja la
  // barra diaria del tipo de cambio con el valor de apertura hasta que el día
  // termina en Londres, y el dólar del tablero iría siempre un día atrás.
  const price = meta.regularMarketPrice;
  const at = meta.regularMarketTime;
  if (typeof price === 'number' && typeof at === 'number') {
    const date = localDate(at);
    const bar = byDate.get(date);
    byDate.set(date, {
      yahoo_ticker: ticker,
      price_date: date,
      close: price,
      adj_close: bar?.adj_close ?? null,
      low: typeof bar?.low === 'number' ? Math.min(bar.low, price) : null,
      high: typeof bar?.high === 'number' ? Math.max(bar.high, price) : null,
      volume: bar?.volume ?? null,
    });
  }

  return [...byDate.values()]
    .filter((r) => r.price_date >= desde)
    .sort((a, b) => a.price_date.localeCompare(b.price_date));
}
