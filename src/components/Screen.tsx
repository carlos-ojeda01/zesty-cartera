import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, BottomTabs, MacroStrip, type MacroItem, type TabKey } from '@/components/Chrome';
import { FadeIn } from '@/components/FadeIn';
import { Note, T } from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { MAX_WIDTH, space, type } from '@/theme/tokens';

/**
 * El marco del tablero.
 *
 * En escritorio el contenido es una lámina de 1360px con borde, centrada sobre
 * un fondo gris: el mockup dibuja el tablero como un objeto, no como una
 * página que se estira hasta donde llegue el monitor. En teléfono ese marco
 * desaparece —un borde a 4px de cada lado solo roba ancho— y la lámina ocupa
 * todo, con las pestañas ancladas abajo.
 */
export function Screen({
  macro,
  subtitle,
  tab,
  onTab,
  loading,
  refreshing,
  error,
  onRefresh,
  children,
}: {
  macro: MacroItem[];
  subtitle?: string;
  tab: TabKey;
  onTab: (t: TabKey) => void;
  loading?: boolean;
  /** Hay datos en pantalla y además una actualización de precios en vuelo. */
  refreshing?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isDesktop, gutter } = useLayout();

  const framed = isDesktop;

  return (
    <View style={{ flex: 1, backgroundColor: framed ? theme.page : theme.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: 'center',
          paddingTop: framed ? space.xxl : 0,
          paddingBottom: framed ? space.xxl : 0,
          paddingHorizontal: framed ? space.xl : 0,
        }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              // El gesto de tirar hacia abajo es el que dispara `onRefresh`, así
              // que su rueda tiene que seguir a `refreshing` —la actualización
              // que corre con datos en pantalla—, no a la carga inicial.
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={theme.accent}
            />
          ) : undefined
        }
      >
        <View
          style={{
            width: '100%',
            maxWidth: MAX_WIDTH,
            backgroundColor: theme.bg,
            borderWidth: framed ? 1 : 0,
            borderColor: theme.borderStrong,
            // Sin `overflow: hidden` la franja macro se sale del borde del marco
            // por la esquina superior.
            overflow: 'hidden',
          }}
        >
          {/* En teléfono la franja macro empieza bajo el notch. */}
          <View style={{ paddingTop: framed ? 0 : insets.top }}>
            <MacroStrip items={macro} />
          </View>

          <AppHeader
            subtitle={subtitle}
            tab={tab}
            onTab={onTab}
            onRefresh={onRefresh}
            refreshing={refreshing}
          />

          {error ? (
            <View style={{ padding: gutter, gap: space.md }}>
              <T style={{ color: theme.negative, fontSize: type.body, fontWeight: '600' }}>
                No se pudo cargar el tablero.
              </T>
              <T style={{ color: theme.textMuted, fontSize: type.micro }}>{error}</T>
              {onRefresh ? (
                <Pressable
                  onPress={onRefresh}
                  accessibilityRole="button"
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: space.sm,
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    backgroundColor: theme.accent,
                  }}
                >
                  <T style={{ color: '#ffffff', fontSize: type.label, fontWeight: '600' }}>
                    Reintentar
                  </T>
                </Pressable>
              ) : null}
            </View>
          ) : loading ? (
            <View style={{ paddingVertical: 80, alignItems: 'center', gap: space.md }}>
              <ActivityIndicator color={theme.accent} />
              <Note>Consultando la cuenta…</Note>
            </View>
          ) : (
            <FadeIn replayOnFocus>{children}</FadeIn>
          )}
        </View>
      </ScrollView>

      {!isDesktop && <BottomTabs tab={tab} onTab={onTab} bottomInset={insets.bottom} />}
    </View>
  );
}
