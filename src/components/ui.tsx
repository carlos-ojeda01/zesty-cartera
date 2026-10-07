import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useLayout } from '@/hooks/useLayout';
import { percent } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { FONT, kicker, numericFont, space, type } from '@/theme/tokens';

/**
 * Ladrillos del tablero, en la clave del mockup: esquinas rectas, bordes de
 * 1px y ningún relleno de color salvo cuando algo está activo.
 */

/** Texto base. Centraliza la fuente para no repetir `fontFamily` en cada nodo. */
export function T({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: FONT }, style]}>
      {children}
    </Text>
  );
}

/** Etiqueta en versalitas. Rotula un bloque sin competir con su cifra. */
export function Kicker({ children, tone }: { children: ReactNode; tone?: string }) {
  const theme = useTheme();
  return <T style={[kicker, { color: tone ?? theme.textMuted }]}>{children}</T>;
}

export function SectionTitle({ children, meta }: { children: ReactNode; meta?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <T
        style={{
          color: theme.text,
          fontSize: type.section,
          fontWeight: '800',
          letterSpacing: -0.15,
        }}
      >
        {children}
      </T>
      {meta ? <T style={{ color: theme.textFaint, fontSize: type.micro }}>{meta}</T> : null}
    </View>
  );
}

/** Cifra grande, tabular. */
export function Figure({
  value,
  size = type.hero,
  color,
}: {
  value: string;
  size?: number;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <T
      style={[
        {
          color: color ?? theme.text,
          fontSize: size,
          fontWeight: '800',
          // El tracking negativo es lo que hace que una cifra de 52px se lea
          // como un titular y no como texto simplemente ampliado.
          letterSpacing: size >= 40 ? -1.8 : size >= 24 ? -0.7 : -0.3,
          lineHeight: size * 1.05,
        },
        numericFont,
      ]}
    >
      {value}
    </T>
  );
}

/**
 * Variación con color.
 * Verde y rojo son los únicos colores semánticos: si algo está verde ganó, si
 * está rojo perdió. El violeta de la interfaz nunca significa nada de eso.
 */
export function Delta({
  value,
  size = type.body,
  digits = 2,
  weight = '800',
}: {
  value: number | null | undefined;
  size?: number;
  digits?: number;
  weight?: TextStyle['fontWeight'];
}) {
  const theme = useTheme();
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <T style={{ color: theme.textFaint, fontSize: size }}>—</T>;
  }
  return (
    <T
      style={[
        {
          color: value > 0 ? theme.positive : value < 0 ? theme.negative : theme.textMuted,
          fontSize: size,
          fontWeight: weight,
        },
        numericFont,
      ]}
    >
      {percent(value, digits)}
    </T>
  );
}

/** Contenedor con borde. El equivalente de `.dv-card` del mockup. */
export function Panel({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const theme = useTheme();
  const { gutter } = useLayout();
  return (
    <View
      style={[
        { borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: theme.surface },
        padded && { padding: gutter },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Regla de 2px. Separa bloques; la de 1px separa filas. */
export function Rule() {
  const theme = useTheme();
  return <View style={{ height: 2, backgroundColor: theme.rule }} />;
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}

/**
 * Selector segmentado. Recuadro con un borde y la opción activa en violeta
 * sólido, como en el mockup — sin píldoras ni sombras.
 */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  stretch = false,
}: {
  options: readonly { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  /** En teléfono los controles ocupan el ancho completo y se tocan con el pulgar. */
  stretch?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.segmented,
        { borderColor: theme.borderStrong },
        stretch ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' },
      ]}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.segmentedOpt,
              stretch && { flex: 1, alignItems: 'center' },
              i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.borderStrong },
              { backgroundColor: active ? theme.accent : 'transparent' },
            ]}
          >
            <T
              style={{
                color: active ? '#ffffff' : theme.textMuted,
                fontSize: type.label,
                fontWeight: '600',
              }}
            >
              {opt.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Casilla cuadrada. Enciende y apaga las series opcionales del gráfico. */
export function CheckToggle({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.check}
    >
      <View
        style={[
          styles.checkBox,
          {
            borderColor: checked ? theme.accent : theme.borderStrong,
            backgroundColor: checked ? theme.accent : 'transparent',
          },
        ]}
      >
        {checked ? (
          <T style={{ color: '#ffffff', fontSize: 9, fontWeight: '800', lineHeight: 11 }}>✓</T>
        ) : null}
      </View>
      <T style={{ color: checked ? theme.text : theme.textMuted, fontSize: type.label }}>
        {label}
      </T>
    </Pressable>
  );
}

/** Etiqueta rectangular: COMPRA / VENTA, aporte / retiro. */
export function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <T style={{ color: fg, fontSize: type.nano, fontWeight: '800', letterSpacing: 0.4 }}>
        {label}
      </T>
    </View>
  );
}

/** Cuadrado de mercado (CL / US) que abre cada fila de posición. */
export function MarketChip({ market, size = 26 }: { market: 'cl' | 'us'; size?: number }) {
  const theme = useTheme();
  const bg = market === 'cl' ? theme.accent : theme.text;
  // En modo oscuro la tinta ES el fondo, así que un chip "tinta sobre tinta"
  // desaparecería: se invierte el texto para que el cuadrado siga leyéndose.
  const fg = theme.mode === 'dark' && market === 'us' ? theme.bg : '#ffffff';
  return (
    <View style={{ width: size, height: size, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ color: fg, fontSize: type.pico, fontWeight: '800' }}>
        {market === 'cl' ? 'CL' : 'US'}
      </T>
    </View>
  );
}

/** Fila etiqueta / valor. */
export function Row({
  label,
  value,
  hint,
  emphasis = false,
  valueColor,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
  valueColor?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <T
          style={{
            color: emphasis ? theme.text : theme.textMuted,
            fontSize: type.body,
            fontWeight: emphasis ? '600' : '400',
          }}
        >
          {label}
        </T>
        {hint ? (
          <T style={{ color: theme.textFaint, fontSize: type.micro, marginTop: 2 }}>{hint}</T>
        ) : null}
      </View>
      <T
        style={[
          {
            color: valueColor ?? theme.text,
            fontSize: type.body,
            fontWeight: emphasis ? '800' : '600',
          },
          numericFont,
        ]}
      >
        {value}
      </T>
    </View>
  );
}

export function Note({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <T style={{ color: theme.textFaint, fontSize: type.micro, lineHeight: 17, marginTop: space.sm }}>
      {children}
    </T>
  );
}

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}

/**
 * Franja de indicadores.
 *
 * En escritorio son columnas separadas por una línea vertical, como en el
 * mockup. En teléfono cuatro columnas dejarían cifras de 27px en 90px de
 * ancho, así que se parten en dos filas de dos y la línea divisoria pasa a ser
 * horizontal: misma retícula, otra orientación.
 */
export function KpiStrip({ items }: { items: Kpi[] }) {
  const theme = useTheme();
  const { isPhone, gutter } = useLayout();
  const perRow = isPhone ? 2 : items.length;

  return (
    <View style={[styles.kpiStrip, { borderColor: theme.border }]}>
      {items.map((k, i) => (
        <View
          key={k.label}
          style={[
            {
              paddingVertical: isPhone ? 13 : 20,
              paddingHorizontal: isPhone ? 14 : gutter,
              width: isPhone ? '50%' : undefined,
              flex: isPhone ? undefined : 1,
              borderColor: theme.border,
            },
            i % perRow !== perRow - 1 && { borderRightWidth: 1 },
            isPhone && i < items.length - perRow && { borderBottomWidth: 1 },
          ]}
        >
          <Kicker>{k.label}</Kicker>
          <View style={{ marginTop: 5 }}>
            <Figure value={k.value} size={isPhone ? type.kpiSm : type.kpi} color={k.color} />
          </View>
          {k.sub ? (
            <T style={{ color: theme.textFaint, fontSize: type.micro, marginTop: 3 }}>{k.sub}</T>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Barra de peso dentro de la tabla de posiciones. */
export function WeightBar({ fraction }: { fraction: number }) {
  const theme = useTheme();
  return (
    <View style={{ width: 46, height: 5, backgroundColor: theme.grid }}>
      <View
        style={{
          width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
          height: '100%',
          backgroundColor: theme.accent,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    flexWrap: 'wrap',
    marginBottom: space.md,
  },
  segmented: { flexDirection: 'row', borderWidth: 1 },
  segmentedOpt: { paddingVertical: 7, paddingHorizontal: 13, justifyContent: 'center' },
  check: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  checkBox: {
    width: 15,
    height: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: { alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 9 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  kpiStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
});
