import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FxWaterfall } from '@/components/FxWaterfall';
import { Panel, Delta, Divider, Note, Row, SectionTitle } from '@/components/ui';
import type { FullSnapshot } from '@/hooks/useSnapshot';
import { FX_SPREAD_CLP, FX_TICKER, fxBridge } from '@/lib/finance';
import { dollars, longDate, money, percent, rate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type } from '@/theme/tokens';

export function UsaSections({ data }: { data: FullSnapshot }) {
  const theme = useTheme();

  const view = useMemo(() => {
    const positions = data.positions.filter((p) => p.market === 'us');
    const usdNow = positions.reduce((s, p) => s + (p.market_value ?? 0), 0);
    const cash = data.balances.find((b) => b.market === 'us')?.cash ?? 0;

    const buys = data.fxTrades.filter((f) => f.side === 'buy');
    const clpInvested = buys.reduce((s, f) => s + f.clp_amount, 0);
    const usdAcquired = buys.reduce((s, f) => s + f.usd_amount, 0);

    const midNow = data.prices
      .filter((p) => p.yahoo_ticker === FX_TICKER)
      .sort((a, b) => a.price_date.localeCompare(b.price_date))
      .at(-1)?.close;

    if (!midNow || usdAcquired === 0) return null;

    return {
      bridge: fxBridge({ clpInvested, usdAcquired, usdNow: usdNow + cash, midNow }),
      positions,
      cash,
      midNow,
      buys,
    };
  }, [data]);

  if (!view) {
    return (
      <Panel>
        <Text style={{ color: theme.textMuted, fontSize: type.body }}>
          Todavía no hay posiciones en Estados Unidos.
        </Text>
      </Panel>
    );
  }

  return (
    <>
      <Panel>
        <SectionTitle>Los dos números</SectionTitle>
        <View style={styles.twoUp}>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ color: theme.textMuted, fontSize: type.label }}>En dólares</Text>
            <Delta value={view.bridge.returnUsd} size={type.title} />
            <Text style={{ color: theme.textFaint, fontSize: type.micro, marginTop: 2 }}>
              {dollars(view.bridge.usdAcquired)} → {dollars(view.bridge.usdNow)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 140 }}>
            <Text style={{ color: theme.textMuted, fontSize: type.label }}>En pesos, real</Text>
            <Delta value={view.bridge.returnClp} size={type.title} />
            <Text style={{ color: theme.textFaint, fontSize: type.micro, marginTop: 2 }}>
              {money(view.bridge.clpInvested)} → {money(view.bridge.clpNow)}
            </Text>
          </View>
        </View>
        <Note>
          La diferencia entre ambos no es un detalle contable: es la plata que se queda en el
          camino entre lo que sube la acción y lo que llega a tu cuenta en pesos.
        </Note>
      </Panel>

      <Panel>
        <SectionTitle>De dónde sale la diferencia</SectionTitle>
        <FxWaterfall bridge={view.bridge} />
      </Panel>

      <Panel>
        <SectionTitle>Tipo de cambio</SectionTitle>
        <Row label="Mid de mercado hoy" value={rate(view.midNow)} hint="cierre de USD/CLP" />
        <Row
          label="Te compran a"
          value={rate(view.midNow - FX_SPREAD_CLP)}
          hint={`mid menos $${FX_SPREAD_CLP} de spread`}
        />
        <Row
          label="Te venden a"
          value={rate(view.midNow + FX_SPREAD_CLP)}
          hint={`mid más $${FX_SPREAD_CLP} de spread`}
        />
        <Divider />
        <Row
          label="Tasa a la que compraste"
          value={rate(view.bridge.rateAcquired)}
          hint={longDate(view.buys[0].executed_at.slice(0, 10))}
        />
        <Divider />
        <Row
          label="Punto de equilibrio"
          value={rate(view.bridge.breakeven)}
          hint="bajo este mid pierdes plata en pesos aunque ganes en dólares"
          emphasis
          valueColor={view.midNow > (view.bridge.breakeven ?? 0) ? theme.positive : theme.negative}
        />
        <Row
          label="Colchón actual"
          value={`${rate(view.midNow - (view.bridge.breakeven ?? 0))} pesos`}
        />

        <Note>
          El spread de Zesty es fijo en ${FX_SPREAD_CLP} por dólar, no un porcentaje. Eso tiene una
          consecuencia contraintuitiva: te conviene que el peso se debilite, no solo porque tu
          posición vale más pesos, sino porque esos ${FX_SPREAD_CLP} pesan menos. Hoy equivalen a{' '}
          {percent(FX_SPREAD_CLP / view.midNow, 2).replace('+', '')} por lado; si el dólar llegara
          a 1.000 serían {percent(FX_SPREAD_CLP / 1000, 2).replace('+', '')}.
        </Note>
      </Panel>

      <Panel>
        <SectionTitle>Posiciones</SectionTitle>
        {view.positions.map((p) => (
          <Row
            key={p.symbol}
            label={p.symbol}
            value={dollars(p.market_value)}
            hint={`${p.qty.toFixed(6)} acciones a ${dollars(p.current_price)}`}
          />
        ))}
        <Row label="Caja en dólares" value={dollars(view.cash)} />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  twoUp: {
    flexDirection: 'row',
    gap: space.lg,
    marginBottom: space.sm,
    flexWrap: 'wrap',
  },
});
