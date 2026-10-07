/**
 * Sistema visual del tablero — traducción del mockup "Dashboard Portafolio".
 *
 * El mockup abandona la paleta verde de la API de Zesty y se para en otro
 * lugar: violeta #8272ea sobre tinta #1b1725, esquinas rectas y Archivo en
 * tres pesos. No es decoración, es una decisión de lectura. El violeta es el
 * único color de interfaz —la línea de la cartera, el estado activo de un
 * control, la barra de peso de cada posición— y por lo tanto verde y rojo
 * quedan libres para significar una sola cosa: ganó o perdió. En la paleta
 * anterior el verde hacía los dos trabajos a la vez y el ojo no sabía si un
 * verde era "positivo" o "de la marca".
 *
 * Radio cero en todo. Un tablero financiero es una grilla de números; las
 * esquinas redondeadas la ablandan y hacen que las celdas floten en vez de
 * alinearse.
 */

import { Platform } from 'react-native';

export type Mode = 'light' | 'dark';

/** Violeta de interfaz. El único color no semántico de la aplicación. */
export const VIOLET = '#8272ea';
/** Tinta. Texto, franja macro y cabeceras de tabla. */
export const INK = '#1b1725';

/**
 * Rampa del violeta. La usa el donut para repartir diez porciones sin recurrir
 * a diez matices distintos, que es lo que convierte un gráfico en un arcoíris.
 */
export const RAMP = [
  '#5540b8',
  '#6a55dd',
  '#8272ea',
  '#9a8def',
  '#a99df1',
  '#b8aef4',
  '#c6bef6',
  '#cdc6f8',
  '#ded9fa',
  '#e9e5fc',
] as const;

export interface Theme {
  mode: Mode;
  /** Fondo de la página, detrás del marco del tablero. */
  page: string;
  /** Fondo del tablero mismo. */
  bg: string;
  surface: string;
  surfaceAlt: string;
  /** Borde de 1px entre filas y celdas. */
  border: string;
  /** Borde de control: más marcado, para que el botón se lea como botón. */
  borderStrong: string;
  /** Regla de 2px bajo cabeceras. Separa bloques, no elementos. */
  rule: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Violeta de interfaz. */
  accent: string;
  accentSoft: string;
  accentDeep: string;
  /** Solo cifras positivas. */
  positive: string;
  /** Solo cifras negativas. */
  negative: string;
  /**
   * El amarillo del semáforo del analista: ni bueno ni malo, a vigilar.
   *
   * Es el tercer color semántico y solo vive en el semáforo, el checklist y el
   * veredicto. Validado contra el verde y el rojo de cada tema (≥ 15 ΔE en
   * visión normal) y con contraste ≥ 3:1 sobre la superficie. Para daltonismo
   * rojo-verde ningún trío de semáforo se separa solo por el tono, así que
   * siempre va con su etiqueta escrita al lado.
   */
  caution: string;
  /**
   * La caja en el reparto de la cartera.
   *
   * Deliberadamente fuera de la rampa de violeta. Las porciones del donut son
   * todas del mismo violeta porque son la misma clase de cosa —instrumentos, y
   * el tono solo ordena por tamano—. La caja no lo es: no cotiza, no rinde y no
   * se compara con el indice. Darle un tono mas de la rampa la haria pasar por
   * una posicion mas; un color aparte dice de entrada que se lee distinto.
   */
  cash: string;
  /** Franja macro: fondo oscuro fijo, sin importar el tema. */
  strip: string;
  stripText: string;
  stripMuted: string;
  stripFaint: string;
  stripPositive: string;
  stripNegative: string;
  /** Líneas del gráfico. */
  grid: string;
  /** Serie del capital invertido: presente pero nunca protagonista. */
  invested: string;
  benchmark: string;
}

export const light: Theme = {
  mode: 'light',
  page: '#efedf2',
  bg: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#faf9fe',
  border: 'rgba(27,23,37,0.10)',
  borderStrong: 'rgba(27,23,37,0.18)',
  rule: 'rgba(27,23,37,0.28)',
  text: INK,
  textMuted: 'rgba(27,23,37,0.55)',
  textFaint: 'rgba(27,23,37,0.42)',
  accent: VIOLET,
  accentSoft: '#f3f1fe',
  accentDeep: '#402f8c',
  positive: '#41854f',
  negative: '#c4342e',
  caution: '#b07d00',
  cash: '#2f7d78',
  strip: INK,
  stripText: '#ffffff',
  stripMuted: 'rgba(255,255,255,0.50)',
  stripFaint: 'rgba(255,255,255,0.38)',
  stripPositive: '#8de0c0',
  stripNegative: '#ff9b93',
  grid: '#eceaf3',
  invested: '#c3bdd4',
  benchmark: 'rgba(27,23,37,0.34)',
};

/**
 * El mockup solo trae la versión clara. El modo oscuro se deriva de él con dos
 * reglas: la tinta pasa a ser el fondo, y el violeta se aclara al paso 400 de
 * la rampa porque el #8272ea sobre fondo oscuro queda por debajo de 4.5:1.
 */
export const dark: Theme = {
  mode: 'dark',
  page: '#100e16',
  bg: '#17141f',
  surface: '#17141f',
  surfaceAlt: '#1f1b2b',
  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.22)',
  rule: 'rgba(255,255,255,0.32)',
  text: '#f4f2f8',
  textMuted: 'rgba(244,242,248,0.58)',
  textFaint: 'rgba(244,242,248,0.42)',
  accent: '#a99df1',
  accentSoft: '#2a2340',
  accentDeep: '#cdc6f8',
  positive: '#6cc47d',
  negative: '#ff8f86',
  caution: '#f2c94c',
  cash: '#63bfb6',
  strip: '#0c0a12',
  stripText: '#ffffff',
  stripMuted: 'rgba(255,255,255,0.50)',
  stripFaint: 'rgba(255,255,255,0.38)',
  stripPositive: '#8de0c0',
  stripNegative: '#ff9b93',
  grid: 'rgba(255,255,255,0.08)',
  invested: '#4c4463',
  benchmark: 'rgba(244,242,248,0.34)',
};

export const themes: Record<Mode, Theme> = { light, dark };

/**
 * Archivo solo se carga en web (la etiqueta va en `+html.tsx`). En nativo se
 * usa la tipografía del sistema en vez de empaquetar la fuente: San Francisco
 * y Roboto tienen las mismas cifras tabulares, que es lo único que este
 * tablero le exige de verdad a una tipografía.
 */
export const FONT = Platform.select({
  web: 'Archivo, system-ui, -apple-system, sans-serif',
  default: undefined,
});

/**
 * Escala tipográfica. Dos columnas porque el mockup de escritorio y el de
 * teléfono no son la misma pantalla escalada: la cifra grande pasa de 52 a 34,
 * pero la tabla se queda en 13 en ambos. Encoger el cuerpo de texto junto con
 * el titular es lo que vuelve ilegible un tablero en el teléfono.
 */
export const type = {
  hero: 52,
  heroSm: 34,
  kpi: 27,
  kpiSm: 17,
  title: 19,
  section: 15,
  body: 13,
  label: 12,
  micro: 11,
  nano: 10,
  pico: 9.5,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  xxl: 28,
  huge: 44,
} as const;

/** Esquinas rectas en todo el sistema. La constante existe para no sembrar ceros sueltos. */
export const radius = { sm: 0, md: 0, lg: 0 } as const;

/** Versalitas de etiqueta. `letterSpacing` en React Native es px, no em. */
export const kicker = {
  fontSize: type.nano,
  letterSpacing: 1.1,
  textTransform: 'uppercase' as const,
  fontWeight: '600' as const,
};

/** Cifras en tabular: las columnas de montos no se alinean sin esto. */
export const numericFont = {
  fontVariant: ['tabular-nums' as const],
};

/**
 * Puntos de quiebre.
 *
 * `desktop` (940) es donde la cabecera completa —logo, título, cinco pestañas y
 * el botón de recarga— cabe en una línea sin apretarse. `roomy` (1180) es otra
 * cosa: el ancho a partir del cual las ocho columnas de la tabla de posiciones
 * entran sin que el nombre del instrumento se parta en dos líneas.
 *
 * Están separados a propósito. Un portátil de 1280 con el panel lateral del
 * navegador abierto deja 1008 px útiles: ahí las pestañas de arriba caben
 * perfectamente —forzar la barra inferior de teléfono sería absurdo— pero ocho
 * columnas no. Con un solo punto de quiebre había que elegir cuál de los dos
 * errores cometer.
 */
export const BREAKPOINTS = { tablet: 720, desktop: 940, roomy: 1180 } as const;

/** Ancho del tablero en escritorio. El mockup mide 1360. */
export const MAX_WIDTH = 1360;
