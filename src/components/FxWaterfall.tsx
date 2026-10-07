import { StyleSheet, Text, View } from 'react-native';

import type { FxBridge } from '@/lib/finance';
import { money, percent, signedMoney } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { numericFont, radius, space, type } from '@/theme/tokens';

/**
 * La cascada que explica por qué un +6,56% en dólares no es un +6,56% en pesos.
 *
 * Se lee de arriba abajo: cuánto puso el activo, cuánto se llevó la divisa y
 * cuánto costaron los dos peajes del cambio. Cada barra está a escala del tramo
 * más grande, así se ve de un vistazo cuál pesa más.
 */
export function FxWaterfall({ bridge }: { bridge: FxBridge }) {
  const theme = useTheme();

  const steps = [
    { label: 'Ganancia de los papeles', hint: 'a tipo de cambio congelado', value: bridge.bridge.asset },
    {
      label: 'Efecto tipo de cambio',
      hint: `el peso pasó de ${(bridge.rateAcquired - 10).toFixed(2)} a ${bridge.midNow.toFixed(2)}`,
      value: bridge.bridge.currency,
    },
    { label: 'Spread al comprar dólares', hint: '$10 por dólar', value: bridge.bridge.spreadIn },
    { label: 'Spread al venderlos', hint: '$10 por dólar', value: bridge.bridge.spreadOut },
  ];

  const scale = Math.max(...steps.map((s) => Math.abs(s.value)), 1);
  const net = bridge.clpNow - bridge.clpInvested;

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.endpoint}>
        <Text style={{ color: theme.textMuted, fontSize: type.body }}>Pesos invertidos</Text>
        <Text style={[{ color: theme.text, fontSize: type.body, fontWeight: '600' }, numericFont]}>
          {money(bridge.clpInvested)}
        </Text>
      </View>

      {steps.map((s) => {
        const positive = s.value >= 0;
        const color = positive ? theme.positive : theme.negative;
        return (
          <View key={s.label} style={styles.step}>
            <View style={styles.stepLabels}>
              <View style={{ flex: 1, paddingRight: space.md }}>
                <Text style={{ color: theme.text, fontSize: type.label }}>{s.label}</Text>
                <Text style={{ color: theme.textFaint, fontSize: type.micro, marginTop: 1 }}>
                  {s.hint}
                </Text>
              </View>
              <Text style={[{ color, fontSize: type.label, fontWeight: '600' }, numericFont]}>
                {signedMoney(s.value)}
              </Text>
            </View>
            {/* Las barras nacen del centro: a la derecha suman, a la izquierda restan. */}
            <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
              <View
                style={[
                  styles.bar,
                  {
                    backgroundColor: color,
                    width: `${(Math.abs(s.value) / scale) * 50}%`,
                    left: positive ? '50%' : undefined,
                    right: positive ? undefined : '50%',
                  },
                ]}
              />
              <View style={[styles.midline, { backgroundColor: theme.border }]} />
            </View>
          </View>
        );
      })}

      <View style={[styles.endpoint, styles.total, { borderTopColor: theme.border }]}>
        <View>
          <Text style={{ color: theme.text, fontSize: type.body, fontWeight: '600' }}>
            Pesos al liquidar hoy
          </Text>
          <Text style={{ color: theme.textFaint, fontSize: type.micro, marginTop: 2 }}>
            vendiendo los dólares a {(bridge.midNow - 10).toFixed(2)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[{ color: theme.text, fontSize: type.section, fontWeight: '700' }, numericFont]}>
            {money(bridge.clpNow)}
          </Text>
          <Text
            style={[
              { color: net >= 0 ? theme.positive : theme.negative, fontSize: type.label, fontWeight: '600' },
              numericFont,
            ]}
          >
            {signedMoney(net)} · {percent(bridge.returnClp)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  endpoint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.md, marginTop: space.xs },
  step: { gap: space.xs },
  stepLabels: { flexDirection: 'row', alignItems: 'flex-start' },
  track: { height: 8, borderRadius: radius.sm, overflow: 'hidden', position: 'relative' },
  bar: { position: 'absolute', top: 0, bottom: 0 },
  midline: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1 },
});
