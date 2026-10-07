export type Market = 'cl' | 'us';
export type Currency = 'CLP' | 'USD';
export type Side = 'buy' | 'sell';
/**
 * De dónde sale la operación.
 *
 * 'externa' son compras hechas en otra corredora antes de traspasar los
 * papeles a Zesty: el historial de Zesty no las tiene, así que se cargan a mano
 * en `data/manual.json`. Sin ellas, una posición traspasada aparece sin costo.
 */
export type TradeSource = 'zesty' | 'externa';

export interface Asset {
  symbol: string;
  market: Market;
  name: string;
  asset_type: string;
  yahoo_ticker: string;
  currency: Currency;
  is_benchmark: boolean;
  /**
   * false cuando el proveedor no publica serie para el ticker. Esa posición se
   * valoriza a costo y la sincronización no la cuenta como falla.
   */
  syncs_prices: boolean;
}

export interface Trade {
  id: string;
  source: TradeSource;
  symbol: string;
  market: Market;
  side: Side;
  /** ISO 8601. */
  executed_at: string;
  qty: number;
  price: number;
  gross_amount: number;
  commission: number;
  vat: number;
  /** Lo que efectivamente salió (compra) o entró (venta) de la caja. */
  net_amount: number;
  currency: Currency;
  note: string | null;
}

export interface PriceRow {
  yahoo_ticker: string;
  /** YYYY-MM-DD */
  price_date: string;
  close: number;
  adj_close: number | null;
  low: number | null;
  high: number | null;
  /**
   * De donde salio el precio.
   *
   * 'zesty' son los cierres que reporta la corredora, que el tablero usa los
   * dias en que Yahoo no publica sesion. Vienen sin rango intradiario, asi que
   * sin esta marca `isRealSession` los confundiria con relleno y los
   * descartaria, que es justo lo contrario de para lo que estan.
   *
   * Opcional porque los snapshots viejos y el fixture de previsualizacion no lo
   * traen; ausente se interpreta como 'yahoo'.
   */
  source?: 'yahoo' | 'zesty';
}

export interface Dividend {
  id: string;
  symbol: string;
  market: Market;
  /** YYYY-MM-DD */
  paid_at: string;
  amount: number;
  currency: Currency;
}

export interface BenchmarkDividend {
  /** YYYY-MM-DD */
  ex_date: string;
  amount_per_unit: number;
}

export interface FxTrade {
  id: string;
  side: Side;
  executed_at: string;
  clp_amount: number;
  usd_amount: number;
  /** Tasa efectiva de Zesty, spread incluido. */
  rate: number;
  /** Cierre de CLP=X ese día. Solo de contraste. */
  spot_rate: number | null;
}

export interface Position {
  symbol: string;
  market: Market;
  qty: number;
  avg_price: number;
  current_price: number | null;
  market_value: number | null;
  cost_basis: number | null;
  unrealized_pl: number | null;
  currency: Currency;
}

/** Aporte o retiro de plata de la cuenta. No es una operación de bolsa. */
export interface CashMovement {
  id: string;
  kind: 'deposit' | 'withdrawal';
  occurred_at: string;
  amount: number;
  currency: string;
}

/** Caja disponible por mercado, tal como la reporta la API. */
export interface Balance {
  market: Market;
  cash: number;
  buying_power: number | null;
  investments: number | null;
  /**
   * Plata de ventas ya ejecutadas que la corredora todavía no libera.
   *
   * Es del usuario pero no se puede retirar ni reinvertir. Sin este campo, el
   * día de una venta la plata desaparece del tablero: la posición ya no está y
   * `cash` solo cuenta lo retirable.
   */
  pending_settlement: number;
}

/** Todo lo que la app necesita, en una sola llamada. */
export interface Snapshot {
  assets: Asset[];
  trades: Trade[];
  prices: PriceRow[];
  dividends: Dividend[];
  benchmarkDividends: BenchmarkDividend[];
  fxTrades: FxTrade[];
  positions: Position[];
}

/** Qué mercados entran en el cálculo. */
export type Scope = 'all' | 'cl' | 'us';

/** Índice contra el que se compara la cartera. */
export type BenchmarkKey = 'none' | 'ipsa' | 'sp500';

export interface SeriesOptions {
  scope: Scope;
  /**
   * 'real' descuenta el spread de venta del dólar: es la plata que
   * efectivamente llegaría a la cuenta en pesos. 'nominal' usa el mid.
   */
  usdMode: 'real' | 'nominal';
  benchmark: BenchmarkKey;
}

export interface SeriesPoint {
  date: string;
  /**
   * Valor de mercado del portafolio, en CLP.
   *
   * NO se le suman los dividendos cobrados. Llegaron a la caja y desde ahí
   * financiaron compras posteriores, que ya están en el libro de operaciones y
   * por lo tanto dentro de este valor de mercado. Sumarlos otra vez los
   * contaría dos veces.
   */
  portfolio: number;
  /** Valor del portafolio sombra que compró el índice en las mismas fechas. */
  benchmark: number;
  /** Capital aportado acumulado, en CLP. La línea base contra la que se mide todo. */
  invested: number;
}
