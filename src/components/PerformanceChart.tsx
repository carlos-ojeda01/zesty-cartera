import { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Line as SvgLine,
  Text as SvgText,
} from 'react-native-svg';

import { AnimatedCircle, AnimatedPath } from '@/components/svg-animated';
import { T } from '@/components/ui';
import { useChartIntro, revealWindow } from '@/hooks/useChartIntro';
import { useLayout } from '@/hooks/useLayout';
import type { SeriesPoint } from '@/lib/finance';
import { compactMoney, longDate, money, percent, shortDate, signedMoney } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, numericFont, type } from '@/theme/tokens';

/** Operación dibujada sobre la línea. */
export interface ChartMarker {
  date: string;
  side: 'buy' | 'sell';
  symbol: string;
  /** Monto en pesos, siempre positivo. */
  amount: number;
}

interface Props {
  points: SeriesPoint[];
  markers?: ChartMarker[];
  showBenchmark?: boolean;
  showMarkers?: boolean;
  /** Índice bajo el cursor. Lo controla el padre para que el encabezado lo siga. */
  activeIndex: number | null;
  onScrub: (index: number | null) => void;
  /** Cambiarlo vuelve a dibujar la curva. Lo usa el filtro de alcance. */
  replayKey?: string | number;
}

const TOOLTIP_W = 178;

/**
 * La curva del patrimonio.
 *
 * Se dibujan dos series como mucho: la cartera y, si está encendido, el índice
 * con el que se compara. El capital invertido salió del gráfico —era una
 * escalera punteada que seguía a la curva sin agregar lectura— pero sigue vivo
 * como número: es el denominador de toda rentabilidad del tablero y aparece
 * bajo la cifra grande y en el tooltip.
 *
 * El relleno degradado existe porque la línea es violeta y no tinta: 2.4px de
 * violeta sobre blanco pesan menos que una línea negra, y el degradado le
 * devuelve presencia sin ensuciar los números.
 */
export function PerformanceChart({
  points,
  markers = [],
  showBenchmark = false,
  showMarkers = true,
  activeIndex,
  onScrub,
  replayKey,
}: Props) {
  const theme = useTheme();
  const { isPhone, isDesktop } = useLayout();
  const [width, setWidth] = useState(0);

  const height = isPhone ? 190 : isDesktop ? 306 : 250;
  // El margen izquierdo hace sitio a las etiquetas del eje. En teléfono se
  // encogen los montos a "1,2M" y basta con la mitad del espacio.
  const padL = isPhone ? 40 : 62;
  const padT = 10;
  const padB = isPhone ? 30 : 44;
  // Sin margen derecho la última etiqueta del eje X ("sep 26") se corta contra
  // el borde del marco.
  const padR = isPhone ? 4 : 8;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  // El PanResponder se construye una sola vez, pero necesita el ancho y el
  // largo de la serie vigentes; un ref evita recrearlo en cada render.
  const geometry = useRef({ width: 0, count: 0, padL: 0, padR: 0 });
  geometry.current = { width, count: points.length, padL, padR };

  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;

  function report(x: number) {
    const g = geometry.current;
    if (g.width <= 0 || g.count === 0) return;
    const inner = g.width - g.padL - g.padR;
    if (inner <= 0) return;
    const ratio = (x - g.padL) / inner;
    const index = Math.round(ratio * (g.count - 1));
    onScrubRef.current(Math.max(0, Math.min(g.count - 1, index)));
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Impide que el scroll de la página se robe el gesto a mitad de camino.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => report(e.nativeEvent.locationX),
      onPanResponderMove: (e) => report(e.nativeEvent.locationX),
      onPanResponderRelease: () => onScrubRef.current(null),
      onPanResponderTerminate: () => onScrubRef.current(null),
    }),
  ).current;

  /**
   * En escritorio la línea sigue al puntero sin hacer clic, que es lo que uno
   * espera de un gráfico en un monitor. `PanResponder` solo reacciona al
   * arrastre, así que en web se añaden los eventos de mouse directamente;
   * react-native-web los reenvía al nodo del DOM.
   */
  const hoverProps =
    Platform.OS === 'web'
      ? {
          onMouseMove: (e: { nativeEvent: { offsetX: number } }) =>
            report(e.nativeEvent.offsetX),
          onMouseLeave: () => onScrubRef.current(null),
        }
      : {};

  const geo = useMemo(() => {
    if (width <= 0 || points.length < 2) return null;

    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const values: number[] = [];
    for (const p of points) {
      values.push(p.portfolio);
      if (showBenchmark) values.push(p.benchmark);
    }

    let min = Math.min(...values);
    let max = Math.max(...values);
    const pad = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1;
    min -= pad;
    max += pad;

    const x = (i: number) => padL + innerW * (i / (points.length - 1));
    const y = (v: number) => padT + innerH * (1 - (v - min) / (max - min));

    const path = (pick: (p: SeriesPoint) => number) =>
      points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(pick(p)).toFixed(1)}`).join(' ');

    const line = path((p) => p.portfolio);
    const baseline = (height - padB).toFixed(1);

    // Largo real de la curva. La serie es una polilinea, asi que se mide
    // sumando segmentos en vez de pedirle `getTotalLength()` al nodo, que solo
    // existe en el DOM y dejaria la animacion fuera de nativo.
    let lineLength = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = x(i) - x(i - 1);
      const dy = y(points[i].portfolio) - y(points[i - 1].portfolio);
      lineLength += Math.hypot(dx, dy);
    }

    // Rejilla en cuatro pasos. El 0,06 de desplazamiento evita que la primera
    // línea caiga pegada al borde inferior del área de dibujo.
    const grid = Array.from({ length: 4 }, (_, i) => {
      const v = min + (max - min) * (i / 3) * 0.88 + (max - min) * 0.06;
      return { y: y(v), label: compactMoney(v) };
    });

    const tickCount = Math.min(isPhone ? 4 : 7, points.length);
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const idx = Math.round((i * (points.length - 1)) / (tickCount - 1 || 1));
      return {
        x: x(idx),
        label: shortDate(points[idx].date),
        // Las de los extremos se alinean hacia adentro; centradas se salen.
        anchor: i === 0 ? 'start' : i === tickCount - 1 ? 'end' : 'middle',
      } as const;
    });

    // Los marcadores se enganchan al primer punto del eje que alcanza la fecha
    // de la operación: una compra puede caer en sábado, y esa fecha no existe
    // en el eje de precios.
    const dots = showMarkers
      ? markers
          .map((m) => {
            const i = points.findIndex((p) => p.date >= m.date);
            return i < 0
              ? null
              : {
                  ...m,
                  i,
                  cx: x(i),
                  cy: y(points[i].portfolio),
                  t: i / Math.max(points.length - 1, 1),
                };
          })
          .filter((d): d is NonNullable<typeof d> => d !== null)
      : [];

    return {
      x,
      y,
      line,
      lineLength,
      area: `${line} L${x(points.length - 1).toFixed(1)} ${baseline} L${x(0).toFixed(1)} ${baseline} Z`,
      benchmark: showBenchmark ? path((p) => p.benchmark) : null,
      grid,
      ticks,
      dots,
      innerH,
    };
  }, [width, height, points, markers, showBenchmark, showMarkers, padL, padR, padB, isPhone]);

  /**
   * La curva se dibuja sola de izquierda a derecha y el resto la sigue: el
   * relleno sube por detras con un retraso corto, el indice punteado aparece a
   * media carrera y cada punto de operacion se enciende cuando la linea pasa
   * por encima de el. Todo cuelga del mismo reloj, asi que el conjunto se lee
   * como un solo gesto.
   */
  const progress = useChartIntro(geo !== null, 900, replayKey);

  const drawLine = geo
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [geo.lineLength, 0] })
    : 0;
  const areaOpacity = progress.interpolate({
    inputRange: revealWindow(0.12, 0.95),
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const benchmarkOpacity = progress.interpolate({
    inputRange: revealWindow(0.3, 1),
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const active = activeIndex !== null && points[activeIndex] ? points[activeIndex] : null;
  const activeMarker =
    active && geo ? geo.dots.find((d) => d.i === activeIndex) ?? null : null;

  return (
    <View onLayout={onLayout} style={{ height }} {...panResponder.panHandlers} {...hoverProps}>
      {geo && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={theme.accent} stopOpacity={0.34} />
              <Stop offset="45%" stopColor={theme.accent} stopOpacity={0.14} />
              <Stop offset="100%" stopColor={theme.accent} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {geo.grid.map((g, i) => (
            <SvgLine
              key={`g${i}`}
              x1={padL}
              y1={g.y}
              x2={width - padR}
              y2={g.y}
              stroke={theme.grid}
              strokeWidth={1}
            />
          ))}

          <AnimatedPath d={geo.area} fill="url(#fill)" opacity={areaOpacity} />

          {geo.benchmark && (
            <AnimatedPath
              d={geo.benchmark}
              stroke={theme.benchmark}
              strokeWidth={1.5}
              strokeDasharray="2 4"
              fill="none"
              opacity={benchmarkOpacity}
            />
          )}

          <AnimatedPath
            d={geo.line}
            stroke={theme.accent}
            strokeWidth={2.4}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={geo.lineLength}
            strokeDashoffset={drawLine}
          />

          {geo.dots.map((d, i) => {
            const appear = progress.interpolate({
              inputRange: revealWindow(d.t * 0.92, d.t * 0.92 + 0.16),
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });
            return (
              <AnimatedCircle
                key={`m${i}`}
                cx={d.cx}
                cy={d.cy}
                r={appear.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, isPhone ? 4 : 5],
                })}
                fill={d.side === 'buy' ? theme.accent : theme.bg}
                stroke={d.side === 'buy' ? theme.bg : theme.accent}
                strokeWidth={2}
                opacity={appear}
              />
            );
          })}

          {geo.grid.map((g, i) => (
            <SvgText
              key={`gl${i}`}
              x={0}
              y={g.y - 4}
              fontSize={type.nano}
              fill={theme.textFaint}
              fontFamily={FONT}
            >
              {g.label}
            </SvgText>
          ))}

          {geo.ticks.map((t, i) => (
            <SvgText
              key={`t${i}`}
              x={t.x}
              y={height - padB + 18}
              fontSize={type.nano}
              fill={theme.textFaint}
              fontFamily={FONT}
              textAnchor={t.anchor}
            >
              {t.label}
            </SvgText>
          ))}

          {active && activeIndex !== null && (
            <>
              <SvgLine
                x1={geo.x(activeIndex)}
                y1={padT}
                x2={geo.x(activeIndex)}
                y2={padT + geo.innerH}
                stroke={theme.accent}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <Circle
                cx={geo.x(activeIndex)}
                cy={geo.y(active.portfolio)}
                r={4.5}
                fill={theme.bg}
                stroke={theme.accent}
                strokeWidth={2.4}
              />
            </>
          )}
        </Svg>
      )}

      {geo && active && activeIndex !== null && (
        <View
          style={[
            styles.tooltip,
            {
              backgroundColor: theme.strip,
              // Se ancla al cursor pero nunca se sale del gráfico: sin el
              // recorte, en los extremos la mitad de la caja queda fuera.
              left: Math.max(0, Math.min(width - TOOLTIP_W, geo.x(activeIndex) - TOOLTIP_W / 2)),
            },
          ]}
        >
          <T style={{ color: theme.stripMuted, fontSize: type.pico, letterSpacing: 0.9, textTransform: 'uppercase' }}>
            {longDate(active.date)}
          </T>
          <T style={[{ color: theme.stripText, fontSize: 16, fontWeight: '800', marginTop: 2 }, numericFont]}>
            {money(active.portfolio)}
          </T>
          <T style={[{ color: '#b8aef4', fontSize: type.micro, marginTop: 1 }, numericFont]}>
            {active.invested > 0 ? percent(active.portfolio / active.invested - 1) : '—'} ·{' '}
            {signedMoney(active.portfolio - active.invested)}
          </T>
          <T style={{ color: theme.stripFaint, fontSize: type.nano, marginTop: 3 }}>
            {activeMarker
              ? `${activeMarker.side === 'buy' ? 'Compra' : 'Venta'} ${activeMarker.symbol} · ${money(activeMarker.amount)}`
              : `${money(active.invested)} invertidos`}
          </T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    // Va en el estilo y no como prop: react-native-web deprecó la prop y
    // ensucia la consola en cada render del gráfico.
    pointerEvents: 'none',
    top: 0,
    width: TOOLTIP_W,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
});
