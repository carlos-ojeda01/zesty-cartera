import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Panel, Delta, Divider, Kicker, Note, Row, SectionTitle } from '@/components/ui';
import type { FullSnapshot } from '@/hooks/useSnapshot';
import { dividendStats } from '@/lib/finance';
import { longDate, money, percent } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { numericFont, radius, space, type } from '@/theme/tokens';

export function ChileSections({ data }: { data: FullSnapshot }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<string | null>(null);

  const view = useMemo(() => {
    const positions = data.positions.filter((p) => p.market === 'cl');
    const total = positions.reduce((s, p) => s + (p.market_value ?? 0), 0);

    const stats = dividendStats({
      positions,
      dividends: data.dividends.filter((d) => d.market === 'cl'),
      trades: data.trades,
    });
    const statBySymbol = new Map(stats.map((s) => [s.symbol, s]));

    const rows = positions
      .map((p) => ({
        ...p,
        weight: total > 0 ? (p.market_value ?? 0) / total : 0,
        name: data.assets.find((a) => a.symbol === p.symbol)?.name ?? p.symbol,
        stats: statBySymbol.get(p.symbol),
      }))
      .sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));

    const timeline = data.dividends
      .filter((d) => d.market === 'cl')
      .sort((a, b) => b.paid_at.localeCompare(a.paid_at));

    return {
      rows,
      total,
      timeline,
      totalDividends: timeline.reduce((s, d) => s + d.amount, 0),
    };
  }, [data]);

  return (
    <>
      <Panel>
        <SectionTitle>Posiciones</SectionTitle>
        {view.rows.map((row, i) => {
          const isOpen = expanded === row.symbol;
          const totalReturn = row.stats?.totalReturn ?? null;
          const capitalReturn = row.stats?.capitalReturn ?? null;

          return (
            <View key={row.symbol}>
              {i > 0 && <Divider />}
              <Pressable
                onPress={() => setExpanded(isOpen ? null : row.symbol)}
                accessibilityRole="button"
              >
                <View style={styles.positionHeader}>
                  <View style={{ flex: 1, paddingRight: space.md }}>
                    <Text style={{ color: theme.text, fontSize: type.body, fontWeight: '600' }}>
                      {row.symbol}
                    </Text>
                    <Text style={{ color: theme.textFaint, fontSize: type.micro, marginTop: 2 }}>
                      {row.name}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text
                      style={[
                        { color: theme.text, fontSize: type.body, fontWeight: '600' },
                        numericFont,
                      ]}
                    >
                      {money(row.market_value)}
                    </Text>
                    <View style={styles.inlineDelta}>
                      <Delta value={totalReturn} size={type.micro} />
                      <Text style={{ color: theme.textFaint, fontSize: type.micro }}>
                        {percent(row.weight, 1).replace('+', '')}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>

              {isOpen && row.stats && (
                <View style={[styles.detail, { backgroundColor: theme.surfaceAlt }]}>
                  <Row
                    label="Retorno total"
                    value={percent(totalReturn)}
                    hint="precio más dividendos, sobre el costo"
                  />
                  <Row
                    label="Solo el precio"
                    value={percent(capitalReturn)}
                    hint="lo único que muestra la app de Zesty"
                  />
                  <Row
                    label="Dividendos cobrados"
                    value={money(row.stats.collected)}
                    valueColor={row.stats.collected > 0 ? theme.positive : undefined}
                  />
                  <Row
                    label="Yield sobre costo"
                    value={percent(row.stats.yieldOnCost).replace('+', '')}
                    hint="dividendos sobre lo que pagaste por las acciones"
                  />
                  <Row
                    label="Yield corriente"
                    value={percent(row.stats.currentYield).replace('+', '')}
                    hint="últimos 12 meses sobre el valor de mercado"
                  />
                  <Divider />
                  <Row label="Acciones" value={row.qty.toLocaleString('es-CL')} />
                  <Row label="Precio promedio" value={money(row.avg_price)} />
                  <Row label="Precio actual" value={money(row.current_price)} />
                  <Row label="Costo total" value={money(row.cost_basis)} />

                  {capitalReturn !== null &&
                    row.stats.yieldOnCost !== null &&
                    row.stats.yieldOnCost > capitalReturn && (
                      <Note>
                        Acá el dividendo rindió más que el precio:{' '}
                        {percent(row.stats.yieldOnCost).replace('+', '')} contra{' '}
                        {percent(capitalReturn)}.
                      </Note>
                    )}
                </View>
              )}
            </View>
          );
        })}

        <Divider />
        <Row label="Total en acciones chilenas" value={money(view.total)} emphasis />
      </Panel>

      <Panel>
        <SectionTitle>Dividendos</SectionTitle>
        <View style={{ marginBottom: space.md }}>
          <Kicker>Total cobrado</Kicker>
          <Text
            style={[
              { color: theme.positive, fontSize: type.title, fontWeight: '700', marginTop: 2 },
              numericFont,
            ]}
          >
            {money(view.totalDividends)}
          </Text>
        </View>

        {view.timeline.map((d, i) => (
          <View key={d.id}>
            {i > 0 && <Divider />}
            <View style={styles.dividendRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: type.body }}>{d.symbol}</Text>
                <Text style={{ color: theme.textFaint, fontSize: type.micro, marginTop: 2 }}>
                  {longDate(d.paid_at)}
                </Text>
              </View>
              <Text
                style={[
                  { color: theme.positive, fontSize: type.body, fontWeight: '600' },
                  numericFont,
                ]}
              >
                {money(d.amount)}
              </Text>
            </View>
          </View>
        ))}
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  positionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  inlineDelta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  detail: { borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  dividendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
});
