import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Delta, Kicker, MarketChip, T, WeightBar } from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import type { PositionRow } from '@/lib/finance';
import { money, percent } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { numericFont, space, type } from '@/theme/tokens';

type SortKey = 'symbol' | 'qty' | 'avgLocal' | 'price' | 'weight' | 'totalPct' | 'yoc' | 'dayPct';

interface Column {
  key: SortKey;
  label: string;
  align: 'left' | 'right';
  flex: number;
  /** Se cae primero cuando el ancho no alcanza. */
  optional?: boolean;
}

const COLUMNS: Column[] = [
  { key: 'symbol', label: 'Instrumento', align: 'left', flex: 2.6 },
  { key: 'qty', label: 'Cantidad', align: 'right', flex: 1 },
  { key: 'avgLocal', label: 'Precio compra', align: 'right', flex: 1.2, optional: true },
  { key: 'price', label: 'Precio actual', align: 'right', flex: 1.2 },
  { key: 'weight', label: '% del portafolio', align: 'right', flex: 1.6 },
  { key: 'totalPct', label: 'Rent. total', align: 'right', flex: 1 },
  { key: 'yoc', label: 'Yield s/ costo', align: 'right', flex: 1.1, optional: true },
  { key: 'dayPct', label: 'Var. día', align: 'right', flex: 1 },
];

/** Precio en la moneda del instrumento. Los montos chicos llevan decimales. */
function localPrice(v: number | null, currency: 'CLP' | 'USD'): string {
  if (v === null || !Number.isFinite(v)) return '—';
  const prefix = currency === 'USD' ? 'US$' : '$';
  const digits = Math.abs(v) < 1000 ? 2 : 0;
  return (
    prefix +
    v.toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  );
}

const qtyText = (v: number) =>
  v.toLocaleString('es-CL', {
    minimumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
  });

/**
 * Tabla de posiciones.
 *
 * En escritorio y tablet es una tabla de verdad, ordenable por cualquier
 * columna. En teléfono deja de serlo: ocho columnas en 390px obligarían a
 * desplazar en horizontal para leer una fila, que es la peor manera de mirar
 * una cartera. Pasa a ser una lista donde cada instrumento entrega lo que se
 * mira primero —cuánto vale, cuánto pesa y cuánto se movió hoy— y el resto se
 * consulta en escritorio.
 */
export function PositionsTable({
  rows,
  totals,
}: {
  rows: PositionRow[];
  totals: { value: number; totalPct: number | null; yoc: number | null; dayPct: number | null };
}) {
  const theme = useTheme();
  const { isPhone, isRoomy } = useLayout();
  const [sortKey, setSortKey] = useState<SortKey>('weight');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const sign = dir === 'asc' ? 1 : -1;
    const pick = (r: PositionRow) => (sortKey === 'weight' ? r.value : r[sortKey]);
    return rows.slice().sort((a, b) => {
      const va = pick(a);
      const vb = pick(b);
      if (typeof va === 'string' || typeof vb === 'string') {
        return sign * String(va).localeCompare(String(vb));
      }
      // Lo que no tiene dato se va al fondo, se ordene como se ordene.
      if (va === null) return 1;
      if (vb === null) return -1;
      return sign * (va - vb);
    });
  }, [rows, sortKey, dir]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setDir('desc');
    }
  };

  if (isPhone) {
    return (
      <View>
        {sorted.map((r) => (
          <View key={r.symbol} style={[styles.phoneRow, { borderBottomColor: theme.border }]}>
            <MarketChip market={r.market} size={28} />
            <View style={{ flex: 1 }}>
              <T style={{ color: theme.text, fontSize: type.body, fontWeight: '700' }}>
                {r.symbol}
              </T>
              <T numberOfLines={1} style={{ color: theme.textFaint, fontSize: type.nano }}>
                {qtyText(r.qty)} · {percent(r.weight, 1).replace('+', '')}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T
                style={[
                  { color: theme.text, fontSize: type.body, fontWeight: '700' },
                  numericFont,
                ]}
              >
                {money(r.value)}
              </T>
              <View style={styles.phoneDelta}>
                <Delta value={r.dayPct} size={type.nano} weight="600" />
                <T style={{ color: theme.textFaint, fontSize: type.nano }}>hoy</T>
              </View>
            </View>
          </View>
        ))}
        <View style={[styles.phoneTotal, { borderTopColor: theme.rule }]}>
          <Kicker>Valor de mercado</Kicker>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.md }}>
            <T style={[{ color: theme.text, fontSize: type.body, fontWeight: '800' }, numericFont]}>
              {money(totals.value)}
            </T>
            <Delta value={totals.totalPct} size={type.body} digits={1} />
          </View>
        </View>
      </View>
    );
  }

  const cols = COLUMNS.filter((c) => isRoomy || !c.optional);

  return (
    <View>
      <View style={[styles.headRow, { borderBottomColor: theme.rule }]}>
        {cols.map((c) => (
          <Pressable
            key={c.key}
            onPress={() => onSort(c.key)}
            accessibilityRole="button"
            style={{ flex: c.flex, alignItems: c.align === 'right' ? 'flex-end' : 'flex-start' }}
          >
            <T
              style={{
                color: sortKey === c.key ? theme.accent : theme.textMuted,
                fontSize: type.nano,
                letterSpacing: 0.9,
                textTransform: 'uppercase',
                fontWeight: '600',
              }}
            >
              {c.label}
              {sortKey === c.key ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
            </T>
          </Pressable>
        ))}
      </View>

      {sorted.map((r) => (
        <View key={r.symbol} style={[styles.bodyRow, { borderBottomColor: theme.border }]}>
          {cols.map((c) => (
            <View
              key={c.key}
              style={{ flex: c.flex, alignItems: c.align === 'right' ? 'flex-end' : 'flex-start' }}
            >
              {c.key === 'symbol' ? (
                <View style={styles.instrument}>
                  <MarketChip market={r.market} />
                  <View style={{ flexShrink: 1 }}>
                    <T style={{ color: theme.text, fontSize: type.body, fontWeight: '700' }}>
                      {r.symbol}
                    </T>
                    <T numberOfLines={1} style={{ color: theme.textFaint, fontSize: type.nano }}>
                      {r.name}
                      {r.priced ? '' : ' · sin precio, a costo'}
                    </T>
                  </View>
                </View>
              ) : c.key === 'weight' ? (
                <View style={styles.weightCell}>
                  <WeightBar fraction={r.weight} />
                  <T style={[{ color: theme.text, fontSize: type.body }, numericFont]}>
                    {percent(r.weight, 1).replace('+', '')}
                  </T>
                </View>
              ) : c.key === 'totalPct' ? (
                <Delta value={r.totalPct} size={type.body} digits={1} weight="700" />
              ) : c.key === 'dayPct' ? (
                <Delta value={r.dayPct} size={type.body} digits={2} weight="600" />
              ) : (
                <T
                  style={[
                    {
                      color:
                        c.key === 'avgLocal' || c.key === 'yoc' ? theme.textMuted : theme.text,
                      fontSize: type.body,
                    },
                    numericFont,
                  ]}
                >
                  {c.key === 'qty'
                    ? qtyText(r.qty)
                    : c.key === 'avgLocal'
                      ? localPrice(r.avgLocal, r.currency)
                      : c.key === 'price'
                        ? localPrice(r.price, r.currency)
                        : r.yoc && r.yoc > 0
                          ? percent(r.yoc, 2).replace('+', '')
                          : '—'}
                </T>
              )}
            </View>
          ))}
        </View>
      ))}

      <View style={styles.footRow}>
        {cols.map((c) => (
          <View
            key={c.key}
            style={{ flex: c.flex, alignItems: c.align === 'right' ? 'flex-end' : 'flex-start' }}
          >
            {c.key === 'symbol' ? (
              <Kicker>Valor de mercado</Kicker>
            ) : c.key === 'weight' ? (
              <T style={[{ color: theme.text, fontSize: type.body, fontWeight: '700' }, numericFont]}>
                {money(totals.value)}
              </T>
            ) : c.key === 'totalPct' ? (
              <Delta value={totals.totalPct} size={type.body} digits={1} />
            ) : c.key === 'dayPct' ? (
              <Delta value={totals.dayPct} size={type.body} digits={2} weight="600" />
            ) : c.key === 'yoc' ? (
              <T style={[{ color: theme.textMuted, fontSize: type.body }, numericFont]}>
                {totals.yoc && totals.yoc > 0 ? percent(totals.yoc, 2).replace('+', '') : '—'}
              </T>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
    paddingBottom: 9,
    borderBottomWidth: 2,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: 14 },
  instrument: { flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 },
  weightCell: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  phoneDelta: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  phoneTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 2,
  },
});
