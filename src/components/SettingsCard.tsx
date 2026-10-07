import { Text, View } from 'react-native';

import { Panel, Divider, Note, Row, SectionTitle, Segmented } from '@/components/ui';
import type { FullSnapshot } from '@/hooks/useSnapshot';
import { longDate, money, sinceNow } from '@/lib/format';
import { usePreferences } from '@/state/Preferences';
import { useTheme, useThemePref } from '@/theme/ThemeProvider';
import { space, type } from '@/theme/tokens';

/**
 * Los ajustes viven en el mismo tablero, no en otra pantalla.
 *
 * Son cuatro interruptores que cambian cómo se lee la cifra grande de arriba;
 * esconderlos detrás de una navegación obligaría a ir y volver para comparar,
 * que es justo lo que uno quiere hacer con ellos.
 */
export function SettingsCard({ data }: { data: FullSnapshot | null }) {
  const { pref, setPref } = useThemePref();
  const { benchmark, usdMode, set } = usePreferences();

  // Operaciones cargadas a mano y marcadas como estimadas (ver data/manual.json).
  const placeholders = data?.trades.filter((t) => t.note?.startsWith('ESTIMADO')) ?? [];

  return (
    <>
      <Panel>
        <SectionTitle>Ajustes</SectionTitle>

        <View style={{ gap: space.lg }}>
          <Control
            label="Índice de comparación"
            hint="El IPSA cotiza en pesos. El S&P 500 es el índice de retorno total, convertido a pesos comprando al dólar de compra y valorizando al de venta: paga el mismo spread que pagas tú."
          >
            <Segmented
              options={[
                { value: 'ipsa' as const, label: 'IPSA' },
                { value: 'sp500' as const, label: 'S&P 500' },
                { value: 'none' as const, label: 'Ninguno' },
              ]}
              value={benchmark}
              onChange={(v) => set('benchmark', v)}
            />
          </Control>

          <Control
            label="Tramo en dólares"
            hint="«Real» descuenta los $10 de spread por dólar que cobrarían al vender: es lo que de verdad llegaría a tu cuenta."
          >
            <Segmented
              options={[
                { value: 'real', label: 'Real' },
                { value: 'nominal', label: 'Nominal' },
              ]}
              value={usdMode}
              onChange={(v) => set('usdMode', v)}
            />
          </Control>

          <Control label="Tema">
            <Segmented
              options={[
                { value: 'light', label: 'Claro' },
                { value: 'dark', label: 'Oscuro' },
                { value: 'system', label: 'Sistema' },
              ]}
              value={pref}
              onChange={setPref}
            />
          </Control>
        </View>

        <Divider />

        <Row
          label="Última actualización de precios"
          value={data?.syncs?.yahoo ? sinceNow(data.syncs.yahoo.ran_at) : '—'}
          hint="Yahoo Finance · cada vez que corre npm run precios o el tablero"
        />
        {/* La cartera va aparte porque se actualiza por otro camino, y quien
            mira el tablero tiene que poder saber por cuál. Zesty no publica
            API: sus datos solo se pueden pedir por el MCP desde una sesión de
            Claude, así que esta fila envejece sola hasta que alguien la corra. */}
        <Row
          label="Última actualización de la cartera"
          value={data?.syncs?.zesty ? sinceNow(data.syncs.zesty.ran_at) : '—'}
          hint="Zesty · por MCP, desde tu agente"
        />
        <Row label="Operaciones registradas" value={String(data?.trades.length ?? 0)} />
        <Row
          label="Dividendos cobrados"
          value={money(data?.dividends.reduce((s, d) => s + d.amount, 0) ?? 0)}
        />
      </Panel>

      {placeholders.length > 0 && (
        <Panel>
          <SectionTitle>Datos por confirmar</SectionTitle>
          <Note>
            Estas operaciones no están en el historial de Zesty y se cargaron como estimación
            (normalmente, papeles traspasados desde otra corredora). El gráfico y el benchmark
            las usan igual, así que conviene corregirlas en data/manual.json cuando tengas las
            fechas y montos reales.
          </Note>
          {placeholders.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <Divider />}
              <Row
                label={`${t.symbol} · ${t.side === 'buy' ? 'compra' : 'venta'}`}
                value={money(t.net_amount)}
                hint={longDate(t.executed_at.slice(0, 10))}
              />
            </View>
          ))}
        </Panel>
      )}
    </>
  );
}

function Control({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View>
      <Text style={{ color: theme.text, fontSize: type.body, marginBottom: space.sm }}>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text
          style={{
            color: theme.textFaint,
            fontSize: type.micro,
            lineHeight: 16,
            marginTop: space.sm,
          }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
