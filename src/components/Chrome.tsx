import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { kicker, numericFont, space, type } from '@/theme/tokens';

/**
 * El marco del tablero: franja macro, cabecera y —en teléfono— la barra de
 * pestañas de abajo. Son las tres piezas que se ven siempre, pase lo que pase
 * en el contenido.
 */

export type TabKey = 'resumen' | 'movs' | 'divs' | 'caja' | 'analisis';

export const TABS: readonly { key: TabKey; label: string; short: string }[] = [
  { key: 'resumen', label: 'Resumen', short: 'Resumen' },
  { key: 'movs', label: 'Movimientos', short: 'Movs' },
  { key: 'divs', label: 'Dividendos', short: 'Divid.' },
  { key: 'caja', label: 'Caja', short: 'Caja' },
  { key: 'analisis', label: 'Análisis', short: 'Análisis' },
];

export interface MacroItem {
  label: string;
  value: string;
  delta?: string;
  /** null cuando el dato no tiene signo (un stock, no una variación). */
  tone?: 'pos' | 'neg' | null;
  note?: string;
}

/**
 * Franja de contexto de mercado, en tinta sobre el resto del tablero.
 *
 * Va arriba de todo por una razón de lectura: el patrimonio de una cartera con
 * dólares no significa lo mismo un día que el peso se movió 1% que uno en que
 * no se movió. El contexto va antes que la cifra, no en una nota al pie.
 *
 * En teléfono se desplaza en horizontal en vez de recortarse: cinco
 * indicadores comprimidos en 390px quedan ilegibles, y esconder dos sin decirlo
 * es peor que pedir un gesto.
 */
export function MacroStrip({ items }: { items: MacroItem[] }) {
  const theme = useTheme();
  const { isPhone } = useLayout();

  const cell = (m: MacroItem, i: number) => (
    <View
      key={m.label}
      style={[
        styles.macroCell,
        {
          borderRightColor: 'rgba(255,255,255,0.12)',
          borderRightWidth: i === items.length - 1 ? 0 : 1,
          paddingVertical: isPhone ? 9 : 12,
          paddingHorizontal: isPhone ? 12 : 18,
          width: isPhone ? 148 : undefined,
          flex: isPhone ? undefined : 1,
        },
      ]}
    >
      <T style={[kicker, { color: theme.stripMuted, fontSize: type.pico, letterSpacing: 1 }]}>
        {m.label}
      </T>
      <View style={styles.macroValueRow}>
        <T
          style={[
            { color: theme.stripText, fontSize: isPhone ? 13 : 17, fontWeight: '800', letterSpacing: -0.2 },
            numericFont,
          ]}
        >
          {m.value}
        </T>
        {m.delta ? (
          <T
            style={[
              {
                fontSize: isPhone ? 9.5 : 11.5,
                fontWeight: '600',
                color:
                  m.tone === 'pos'
                    ? theme.stripPositive
                    : m.tone === 'neg'
                      ? theme.stripNegative
                      : theme.stripMuted,
              },
              numericFont,
            ]}
          >
            {m.delta}
          </T>
        ) : null}
      </View>
      {m.note && !isPhone ? (
        <T style={{ color: theme.stripFaint, fontSize: type.pico }}>{m.note}</T>
      ) : null}
    </View>
  );

  if (isPhone) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: theme.strip, flexGrow: 0 }}
      >
        {items.map(cell)}
      </ScrollView>
    );
  }

  return <View style={{ flexDirection: 'row', backgroundColor: theme.strip }}>{items.map(cell)}</View>;
}

/**
 * Cabecera. En escritorio lleva las pestañas al medio; en teléfono no, porque
 * ahí viven abajo, al alcance del pulgar.
 */
export function AppHeader({
  subtitle,
  tab,
  onTab,
  onRefresh,
  refreshing,
}: {
  subtitle?: string;
  tab: TabKey;
  onTab: (t: TabKey) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const theme = useTheme();
  const { isPhone, isDesktop, gutter } = useLayout();

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: theme.rule,
          paddingHorizontal: gutter,
          paddingVertical: isPhone ? 14 : 20,
        },
      ]}
    >
      <View style={[styles.logo, { backgroundColor: theme.accent }]}>
        <T style={{ color: '#ffffff', fontWeight: '800', fontSize: 17, lineHeight: 20 }}>Z</T>
      </View>

      <View style={{ marginRight: 'auto', flexShrink: 1 }}>
        <T
          style={{
            color: theme.text,
            fontSize: isPhone ? 16 : type.title,
            fontWeight: '800',
            letterSpacing: -0.35,
          }}
        >
          Mi portafolio
        </T>
        {subtitle ? (
          <T numberOfLines={1} style={{ color: theme.textMuted, fontSize: type.micro }}>
            {subtitle}
          </T>
        ) : null}
      </View>

      {isDesktop ? (
        <View style={{ flexDirection: 'row' }}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => onTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 15,
                  backgroundColor: active ? theme.text : 'transparent',
                }}
              >
                <T
                  style={{
                    color: active ? theme.bg : theme.textMuted,
                    fontSize: type.body,
                    fontWeight: '600',
                  }}
                >
                  {t.label}
                </T>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {onRefresh ? (
        <Pressable
          onPress={onRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Actualizar datos"
          accessibilityState={{ busy: !!refreshing, disabled: !!refreshing }}
          style={[styles.avatar, { borderColor: theme.borderStrong }]}
        >
          {/* La rueda reemplaza al símbolo en vez de acompañarlo: el botón no
              cambia de tamaño y se nota igual que está trabajando. Pedir
              precios toma unos segundos y sin señal parece que no pasó nada. */}
          {refreshing ? (
            <ActivityIndicator size="small" color={theme.textMuted} />
          ) : (
            <T style={{ color: theme.textMuted, fontSize: 14, fontWeight: '600' }}>↻</T>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Pestañas de teléfono y tablet, ancladas abajo.
 *
 * En una pantalla de 390px la navegación arriba obliga a estirar el pulgar
 * hasta la esquina superior cada vez que se cambia de vista. Abajo el gesto es
 * de un centímetro.
 */
export function BottomTabs({
  tab,
  onTab,
  bottomInset,
}: {
  tab: TabKey;
  onTab: (t: TabKey) => void;
  bottomInset: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.bottomTabs,
        {
          backgroundColor: theme.bg,
          borderTopColor: theme.rule,
          paddingBottom: bottomInset + 10,
        },
      ]}
    >
      {TABS.map((t) => {
        const active = t.key === tab;
        const tone = active ? theme.accent : theme.textFaint;
        return (
          <Pressable
            key={t.key}
            onPress={() => onTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={styles.bottomTab}
          >
            <View
              style={{
                width: 18,
                height: 18,
                borderWidth: 2,
                borderColor: tone,
                marginBottom: 5,
                backgroundColor: active ? tone : 'transparent',
              }}
            />
            <T style={{ color: tone, fontSize: type.nano, fontWeight: '600' }}>{t.short}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  macroCell: { gap: 3 },
  macroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    borderBottomWidth: 2,
  },
  logo: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 34,
    height: 34,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabs: {
    flexDirection: 'row',
    borderTopWidth: 2,
    paddingTop: 10,
    paddingHorizontal: 4,
  },
  bottomTab: { flex: 1, alignItems: 'center' },
});
