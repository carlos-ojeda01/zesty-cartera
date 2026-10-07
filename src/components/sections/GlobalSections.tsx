import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { Panel, Divider, Kicker, Note, Row, SectionTitle } from '@/components/ui';
import type { FullSnapshot } from '@/hooks/useSnapshot';
import { BENCHMARKS, buildSeries, costBreakdown, FX_TICKER, quote } from '@/lib/finance';
import { money, percent } from '@/lib/format';
import { usePreferences } from '@/state/Preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type } from '@/theme/tokens';

export function GlobalSections({ data }: { data: FullSnapshot }) {
  const { usdMode, benchmark } = usePreferences();
  const theme = useTheme();

  const resumen = useMemo(() => {
    const usdHeld = data.positions
      .filter((p) => p.currency === 'USD')
      .reduce((s, p) => s + (p.market_value ?? 0), 0);

    const usdRate = quote(data, FX_TICKER).close ?? 0;
    const costs = costBreakdown({ trades: data.trades, fxTrades: data.fxTrades, usdHeld, usdRate });
    const dividends = data.dividends.reduce((s, d) => s + d.amount, 0);

    const clNow =
      buildSeries(data, { scope: 'cl', usdMode, benchmark: 'none' }).points.at(-1)?.portfolio ?? 0;
    const usNow =
      buildSeries(data, { scope: 'us', usdMode, benchmark: 'none' }).points.at(-1)?.portfolio ?? 0;

    return { costs, dividends, clNow, usNow, total: clNow + usNow };
  }, [data, usdMode]);

  return (
    <>
      <Panel>
        <SectionTitle>Reparto</SectionTitle>
        <Row
          label="Chile"
          value={money(resumen.clNow)}
          hint={
            resumen.total > 0
              ? `${percent(resumen.clNow / resumen.total, 1).replace('+', '')} de la cartera`
              : undefined
          }
        />
        <Divider />
        <Row
          label="Estados Unidos"
          value={money(resumen.usNow)}
          hint={
            usdMode === 'real'
              ? 'en pesos, con el spread de venta descontado'
              : 'en pesos, al tipo de cambio de mercado'
          }
        />
        <Divider />
        <Row label="Total" value={money(resumen.total)} emphasis />
      </Panel>

      <Panel>
        <SectionTitle>Lo que no aparece en el P&L de Zesty</SectionTitle>

        <Row
          label="Dividendos cobrados"
          value={money(resumen.dividends)}
          hint="plata que ya está en tu bolsillo y ninguna app te la cuenta como rentabilidad"
          valueColor={theme.positive}
        />
        <Divider />
        {resumen.costs.counts.externa > 0 ? (
          <>
            <Row
              label="Comisiones en otras corredoras"
              value={money(resumen.costs.externa)}
              hint={`${resumen.costs.counts.externa} operaciones antes del traspaso`}
            />
            <Row
              label="Las mismas, con tarifa Zesty"
              value={money(resumen.costs.externaAtZestyRates)}
              hint="0,1785% del monto transado"
            />
          </>
        ) : null}
        <Row
          label="Comisiones en Zesty"
          value={money(resumen.costs.zesty)}
          hint={`${resumen.costs.counts.zesty} operaciones`}
        />
        <Divider />
        <Row
          label="Spread de dólar pagado"
          value={money(resumen.costs.fxPaid)}
          hint="$10 por dólar al comprar"
        />
        <Row
          label="Spread pendiente"
          value={money(resumen.costs.fxPending)}
          hint="lo que costaría repatriar la posición hoy"
        />
        <Divider />
        <Row label="Costo total de operar" value={money(resumen.costs.total)} emphasis />

        <Note>
          Las comisiones de Zesty ya vienen descontadas en cada orden, pero el spread del dólar no
          aparece en ninguna parte: son $10 por dólar al comprar y otros $10 al vender.
        </Note>
      </Panel>

      <Panel>
        <Kicker>Sobre el benchmark</Kicker>
        <View style={{ marginTop: space.sm, gap: space.sm }}>
          <Text style={{ color: theme.textMuted, fontSize: type.body, lineHeight: 21 }}>
            La comparación está contra {BENCHMARKS[benchmark].full}. Cada peso que pusiste en una
            compra se invierte, ese mismo día y al precio de ese día, en el índice; cada venta lo
            saca. Así se compara el resultado de tus decisiones contra no haber elegido nada.
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: type.body, lineHeight: 21 }}>
            La línea punteada del gráfico muestra ese portafolio sombra. Las compras en dólares
            entran por los pesos que costaron, así que el efecto del tipo de cambio y del spread
            queda dentro de la comparación.
          </Text>
        </View>
      </Panel>
    </>
  );
}
