/**
 * Formato chileno en todo: punto para miles, coma para decimales.
 * Los montos en pesos van sin decimales — a esta escala no aportan nada y solo
 * ensucian la lectura.
 */

const clp = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

const usd = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plain = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

const decimal2 = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const money = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : clp.format(v);

export const dollars = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : usd.format(v);

export const number = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : plain.format(v);

export const rate = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : decimal2.format(v);

/** Porcentaje con signo explícito: en finanzas el "+" comunica tanto como el número. */
export function percent(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const pct = v * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toLocaleString('es-CL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** Monto con signo, para variaciones. */
export function signedMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${clp.format(Math.abs(v))}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-09-08' -> '8 sep 2026' */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** '2026-09-08' -> 'sep 26', para los ejes donde el espacio es escaso. */
export function shortDate(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/** Compacta cifras grandes para los ejes: 2.461.123 -> '2,5M' */
export function compactMoney(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString('es-CL', { maximumFractionDigits: 0 })}k`;
  return plain.format(v);
}

/**
 * Cuánto hace que pasó algo, en palabras: 'recién', 'hace 4 min', 'hace 3 d'.
 *
 * Las sincronizaciones se cuentan en minutos, no en días. Desde que el tablero
 * pide precios cada vez que se abre, una fecha sola ('11 sep 2026') dejó de
 * decir nada: siempre es hoy. Lo que importa es si el número que se está
 * mirando tiene dos minutos o seis horas.
 */
export function sinceNow(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return '—';

  const mins = Math.floor((now - then) / 60000);
  if (mins < 0) return 'recién';
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
}

/**
 * El día local de una marca de tiempo con zona: '2026-09-12T00:42Z' -> '2026-09-11'.
 *
 * Las fechas de las tablas ya vienen como día suelto y no tienen este problema,
 * pero `sync_log.ran_at` es un instante y llega en UTC. Cortarlo con
 * `slice(0, 10)` anunciaba el 12 de septiembre a las nueve y media de la noche
 * del 11: en Chile la medianoche UTC cae siempre el día anterior, así que el
 * tablero se adelantaba un día todas las tardes.
 */
export function localDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
