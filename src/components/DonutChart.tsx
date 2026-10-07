import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AnimatedCircle, AnimatedG } from '@/components/svg-animated';
import { T } from '@/components/ui';
import { useChartIntro, revealWindow } from '@/hooks/useChartIntro';
import { useLayout } from '@/hooks/useLayout';
import type { PositionRow } from '@/lib/finance';
import { money, percent } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, numericFont, RAMP, space, type } from '@/theme/tokens';
import Svg, { G, Text as SvgText } from 'react-native-svg';

const SIZE = 260;
const R_OUT = 126;
const R_IN = 78;
const C = SIZE / 2;

/**
 * La dona se dibuja como arcos trazados, no como sectores rellenos.
 *
 * Un sector relleno solo puede crecer recalculando su `d` en cada fotograma;
 * un arco trazado crece moviendo `strokeDashoffset`, que es un número y por
 * tanto animable sin volver a renderizar. La forma en pantalla es la misma
 * —un anillo entre R_IN y R_OUT— porque el trazo se centra en el radio medio
 * y su grosor es exactamente la diferencia entre ambos radios.
 */
const R_MID = (R_OUT + R_IN) / 2;
const RING = R_OUT - R_IN;
const CIRC = 2 * Math.PI * R_MID;

/** Ranura entre porciones, en radianes. Sin ella dos tonos contiguos se funden. */
const GAP = 0.02;

/**
 * Reparto de la cartera.
 *
 * Todas las porciones salen de la misma rampa de violeta en vez de diez tonos
 * distintos. Un arcoíris obliga a saltar entre el gráfico y la leyenda para
 * saber qué es cada cosa; una rampa ordenada de mayor a menor hace que la
 * posición en el círculo y el tono digan lo mismo, y la leyenda queda como
 * confirmación y no como diccionario.
 *
 * El anillo se arma girando desde las 12 en punto: cada porción crece durante
 * su propio tramo del reloj, así que el conjunto se lee como una sola manecilla
 * dando la vuelta y no como seis piezas apareciendo a destiempo.
 */
export function DonutChart({
  rows,
  total,
  cash,
  replayKey,
}: {
  rows: PositionRow[];
  /** Suma de las porciones. Incluye la caja cuando viene. */
  total: number;
  /**
   * La caja, como una porción más del reparto.
   *
   * Va siempre al final del anillo y con su propio color, nunca ordenada por
   * tamaño junto a los instrumentos: no compite con ellos por ser la posición
   * más grande, es otra categoría.
   */
  cash?: { value: number; label: string };
  /** Cambiarlo vuelve a armar el anillo. Lo usa el filtro de alcance. */
  replayKey?: string | number;
}) {
  const theme = useTheme();
  const { isPhone, isRoomy } = useLayout();
  const progress = useChartIntro(true, 950, replayKey);

  const { segments, legend } = useMemo(() => {
    const sorted = rows.slice().sort((a, b) => b.value - a.value);

    const slices: { key: string; fill: string; value: number; symbol: string; name: string }[] =
      sorted.map((p, i) => ({
        key: p.symbol,
        fill: RAMP[i % RAMP.length],
        value: p.value,
        symbol: p.symbol,
        name: p.name,
      }));

    if (cash && cash.value > 0) {
      slices.push({
        key: '__caja__',
        fill: theme.cash,
        value: cash.value,
        symbol: 'CAJA',
        name: cash.label,
      });
    }

    let angle = 0;

    const segments = slices
      .filter((p) => p.value > 0 && total > 0)
      .map((p) => {
        const share = p.value / total;
        const sweep = share * Math.PI * 2;
        const from = angle / (Math.PI * 2);
        angle += sweep;

        return {
          key: p.key,
          fill: p.fill,
          // Un <circle> de SVG arranca a las 3 en punto; el giro lo lleva al
          // comienzo de su porción, contado desde las 12.
          rotation: -90 + (from * 360),
          arc: Math.max(sweep - GAP, 0.001) * R_MID,
          from,
          to: angle / (Math.PI * 2),
        };
      });

    const legend = slices.map((p) => ({
      key: p.key,
      fill: p.fill,
      symbol: p.symbol,
      name: p.name,
      value: p.value,
      pct: total > 0 ? p.value / total : 0,
    }));

    return { segments, legend };
  }, [rows, total, cash, theme.cash]);

  const dim = isPhone ? 200 : SIZE;

  /**
   * Qué porción está señalada. `null` es el estado de reposo, con el total al
   * centro.
   */
  const [active, setActive] = useState<string | null>(null);

  // El detector se construye una sola vez; los datos vigentes entran por ref
  // para no rearmar el PanResponder en cada render.
  const hitRef = useRef<{ dim: number; segments: typeof segments }>({ dim, segments });
  hitRef.current = { dim, segments };

  /**
   * De un punto de la pantalla a una porción del anillo.
   *
   * Se resuelve con geometría en vez de hit-testing sobre el SVG: los arcos se
   * dibujan como un trazo con `strokeDasharray` animado, así que el area
   * sensible cambiaría durante la animación de entrada. El ángulo no.
   */
  function hit(x: number, y: number) {
    const g = hitRef.current;
    if (g.dim <= 0) return;

    // Del tamaño en pantalla al sistema del viewBox.
    const k = SIZE / g.dim;
    const dx = x * k - C;
    const dy = y * k - C;

    // Fuera del anillo —el agujero del centro o el margen— no hay porción.
    const r = Math.hypot(dx, dy);
    if (r < R_IN || r > R_OUT) {
      setActive(null);
      return;
    }

    // Ángulo desde las 12 en punto y en sentido horario, que es como se
    // repartieron las porciones.
    let theta = Math.atan2(dx, -dy);
    if (theta < 0) theta += Math.PI * 2;
    const f = theta / (Math.PI * 2);

    setActive(g.segments.find((seg) => f >= seg.from && f < seg.to)?.key ?? null);
  }

  /**
   * En el teléfono la porción queda fija al tocarla y no se suelta al levantar
   * el dedo: si se limpiara en `Release` el dato aparecería y desaparecería en
   * el mismo gesto, sin alcanzar a leerse. En escritorio se limpia al salir el
   * puntero, que es el gesto equivalente.
   */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => hit(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) => hit(e.nativeEvent.locationX, e.nativeEvent.locationY),
    }),
  ).current;

  const hoverProps =
    Platform.OS === 'web'
      ? {
          onMouseMove: (e: { nativeEvent: { offsetX: number; offsetY: number } }) =>
            hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY),
          onMouseLeave: () => setActive(null),
        }
      : {};

  const shown = active ? legend.find((l) => l.key === active) ?? null : null;

  // El total del centro entra al final: es la conclusión de lo que el anillo
  // acaba de contar, y leerlo antes de que exista el anillo no significa nada.
  const centerOpacity = progress.interpolate({
    inputRange: revealWindow(0.72, 1),
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.wrap, isPhone && { flexDirection: 'column', alignItems: 'stretch' }]}>
      <View
        style={{ alignSelf: 'center', width: dim, height: dim }}
        {...panResponder.panHandlers}
        {...hoverProps}
      >
        <Svg width={dim} height={dim} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {segments.map((s) => (
            <G key={s.key} transform={`rotate(${s.rotation}, ${C}, ${C})`}>
              <AnimatedCircle
                cx={C}
                cy={C}
                r={R_MID}
                fill="none"
                stroke={s.fill}
                // Con una porción señalada, el resto se apaga: el anillo deja
                // de competir con la cifra del centro.
                opacity={active === null || active === s.key ? 1 : 0.3}
                strokeWidth={RING}
                // El patrón deja un solo trazo visible; lo que crece es cuánto
                // de él se destapa.
                strokeDasharray={[CIRC, CIRC]}
                strokeDashoffset={progress.interpolate({
                  inputRange: revealWindow(s.from, s.to),
                  outputRange: [CIRC, CIRC - s.arc],
                  extrapolate: 'clamp',
                })}
              />
            </G>
          ))}

          {/* El centro responde al puntero: en reposo el total, y con una
              porción señalada su monto, que es el dato que hay que ir a buscar
              a la leyenda de otro modo. */}
          <AnimatedG opacity={centerOpacity}>
            <SvgText
              x={C}
              y={shown ? C - 16 : C - 6}
              textAnchor="middle"
              fontSize={10}
              fill={shown ? shown.fill : theme.textFaint}
              fontWeight={shown ? '800' : '400'}
              fontFamily={FONT}
            >
              {shown ? shown.symbol : 'TOTAL'}
            </SvgText>
            <SvgText
              x={C}
              y={shown ? C + 8 : C + 18}
              textAnchor="middle"
              fontSize={19}
              fontWeight="800"
              fill={theme.text}
              fontFamily={FONT}
            >
              {money(shown ? shown.value : total)}
            </SvgText>
            {shown ? (
              <SvgText
                x={C}
                y={C + 28}
                textAnchor="middle"
                fontSize={12}
                fill={theme.textMuted}
                fontFamily={FONT}
              >
                {percent(shown.pct, 1).replace('+', '')} de la cartera
              </SvgText>
            ) : null}
          </AnimatedG>
        </Svg>
      </View>

      <View style={[styles.legend, isPhone && { marginTop: space.lg }]}>
        {legend.map((l, i) => (
          <Animated.View
            key={l.key}
            style={[
              styles.legendItem,
              { borderBottomColor: theme.border, width: isRoomy ? '48%' : '100%' },
              {
                // Cada fila entra cuando su porción termina de dibujarse, así
                // la vista sigue al anillo en vez de competir con él.
                opacity: progress.interpolate({
                  inputRange: revealWindow(i / Math.max(legend.length, 1), 1),
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          >
            {/* La leyenda es el otro camino al mismo dato, y en el teléfono es
                el cómodo: las porciones chicas son difíciles de acertar con el
                dedo, una fila de lista no. */}
            <Pressable
              style={styles.legendRow}
              onHoverIn={() => setActive(l.key)}
              onHoverOut={() => setActive(null)}
              onPress={() => setActive((prev) => (prev === l.key ? null : l.key))}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  backgroundColor: l.fill,
                  opacity: active === null || active === l.key ? 1 : 0.3,
                }}
              />
              <T
                style={{
                  color: theme.text,
                  fontSize: type.body,
                  fontWeight: active === l.key ? '800' : '600',
                  width: 92,
                }}
              >
                {l.symbol}
              </T>
              <T numberOfLines={1} style={{ color: theme.textMuted, fontSize: type.micro, flex: 1 }}>
                {/* Señalada, la fila cambia el nombre por el monto: es la
                    respuesta a "cuánta plata es esto" sin mover la vista. */}
                {active === l.key ? money(l.value) : l.name}
              </T>
              <T
                style={[
                  { color: theme.text, fontSize: type.body, fontWeight: '600' },
                  numericFont,
                ]}
              >
                {percent(l.pct, 1).replace('+', '')}
              </T>
            </Pressable>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: space.huge, alignItems: 'center' },
  legend: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  legendItem: {
    borderBottomWidth: 1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
});
