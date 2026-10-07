import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { DataTable, type Column } from '@/components/DataTable';
import {
  Divider,
  Figure,
  Kicker,
  KpiStrip,
  Note,
  Panel,
  Row,
  SectionTitle,
  T,
  Tag,
  type Kpi,
} from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import type { FullSnapshot } from '@/hooks/useSnapshot';
import {
  buildCashBalance,
  buildCashRows,
  buildDividendRows,
  buildMoveRows,
  dividendsByMonth,
  FX_SPREAD_CLP,
  type CashRow,
  type DividendRow,
  type MoveRow,
  type Scope,
} from '@/lib/finance';
import { dollars, longDate, money, rate as rateFmt, signedMoney } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { numericFont, space, type } from '@/theme/tokens';

/**
 * Las tres cartolas: qué se operó, qué pagó dividendos y qué entró o salió de
 * la cuenta. Comparten forma porque responden la misma clase de pregunta —qué
 * pasó y cuándo— y se leen en orden cronológico inverso.
 */

const localPrice = (v: number, currency: 'CLP' | 'USD') => {
  const digits = Math.abs(v) < 1000 ? 2 : 0;
  return (
    (currency === 'USD' ? 'US$' : '$') +
    v.toLocaleString('es-CL', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  );
};

const qtyText = (v: number) =>
  v.toLocaleString('es-CL', {
    minimumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
    maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0,
  });

/** Envoltorio común: título, contenido y márgenes coherentes con el resto. */
function Sheet({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  const { gutter } = useLayout();
  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: space.xxl, paddingBottom: space.xxl }}>
      <SectionTitle meta={meta}>{title}</SectionTitle>
      {children}
    </View>
  );
}

export function MovimientosTab({ data, scope }: { data: FullSnapshot; scope: Scope }) {
  const theme = useTheme();
  const rows = useMemo(() => buildMoveRows(data, scope), [data, scope]);

  const columns: Column<MoveRow>[] = [
    {
      key: 'date',
      label: 'Fecha',
      flex: 1.3,
      render: (r) => (
        <T style={{ color: theme.textMuted, fontSize: type.body }}>{longDate(r.date)}</T>
      ),
    },
    {
      key: 'side',
      label: 'Tipo',
      flex: 0.9,
      render: (r) => (
        <Tag
          label={r.side === 'buy' ? 'COMPRA' : 'VENTA'}
          bg={r.side === 'buy' ? theme.accentSoft : theme.surfaceAlt}
          fg={r.side === 'buy' ? theme.accentDeep : theme.text}
        />
      ),
    },
    {
      key: 'symbol',
      label: 'Instrumento',
      flex: 2.4,
      render: (r) => (
        <View style={styles.inline}>
          <T style={{ color: theme.text, fontSize: type.body, fontWeight: '700' }}>{r.symbol}</T>
          <T numberOfLines={1} style={{ color: theme.textFaint, fontSize: type.micro, flexShrink: 1 }}>
            {r.name}
          </T>
        </View>
      ),
    },
    {
      key: 'source',
      label: 'Corredora',
      align: 'right',
      flex: 0.9,
      optional: true,
      render: (r) => (
        <T style={{ color: theme.textMuted, fontSize: type.micro, textTransform: 'capitalize' }}>
          {r.source}
        </T>
      ),
    },
    {
      key: 'qty',
      label: 'Cantidad',
      align: 'right',
      flex: 1,
      render: (r) => (
        <T style={[{ color: theme.text, fontSize: type.body }, numericFont]}>{qtyText(r.qty)}</T>
      ),
    },
    {
      key: 'price',
      label: 'Precio',
      align: 'right',
      flex: 1.1,
      render: (r) => (
        <T style={[{ color: theme.text, fontSize: type.body }, numericFont]}>
          {localPrice(r.price, r.currency)}
        </T>
      ),
    },
    {
      key: 'fee',
      label: 'Comisión',
      align: 'right',
      flex: 1,
      optional: true,
      render: (r) => (
        <T style={[{ color: theme.textMuted, fontSize: type.body }, numericFont]}>
          {money(r.fee)}
        </T>
      ),
    },
    {
      key: 'amount',
      label: 'Monto neto',
      align: 'right',
      flex: 1.3,
      render: (r) => (
        <T
          style={[
            {
              color: r.amount >= 0 ? theme.positive : theme.text,
              fontSize: type.body,
              fontWeight: '700',
            },
            numericFont,
          ]}
        >
          {signedMoney(r.amount)}
        </T>
      ),
    },
  ];

  return (
    <Sheet title="Movimientos" meta={`${rows.length} operaciones ejecutadas`}>
      <DataTable
        rows={rows}
        columns={columns}
        keyOf={(r) => r.id}
        empty="No hay operaciones en este alcance."
        renderPhone={(r) => (
          <View style={styles.phoneRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={styles.inline}>
                <Tag
                  label={r.side === 'buy' ? 'COMPRA' : 'VENTA'}
                  bg={r.side === 'buy' ? theme.accentSoft : theme.surfaceAlt}
                  fg={r.side === 'buy' ? theme.accentDeep : theme.text}
                />
                <T style={{ color: theme.text, fontSize: type.body, fontWeight: '700' }}>
                  {r.symbol}
                </T>
              </View>
              <T style={{ color: theme.textFaint, fontSize: type.nano }}>
                {longDate(r.date)} · {qtyText(r.qty)} a {localPrice(r.price, r.currency)}
              </T>
            </View>
            <T
              style={[
                {
                  color: r.amount >= 0 ? theme.positive : theme.text,
                  fontSize: type.body,
                  fontWeight: '700',
                },
                numericFont,
              ]}
            >
              {signedMoney(r.amount)}
            </T>
          </View>
        )}
      />
      <Note>
        El monto neto es lo que efectivamente salió o entró de la caja: incluye comisión e IVA. Las
        operaciones en dólares se convierten al tipo de cambio que se pagó ese día, no al de hoy.
      </Note>
    </Sheet>
  );
}

export function DividendosTab({ data, scope }: { data: FullSnapshot; scope: Scope }) {
  const theme = useTheme();
  const { isPhone } = useLayout();

  const rows = useMemo(() => buildDividendRows(data, scope), [data, scope]);
  const months = useMemo(() => dividendsByMonth(rows), [rows]);
  const total12 = months.reduce((s, m) => s + m.value, 0);
  const totalAll = rows.reduce((s, r) => s + r.amount, 0);
  const maxMonth = Math.max(...months.map((m) => m.value), 1);

  const columns: Column<DividendRow>[] = [
    {
      key: 'date',
      label: 'Fecha de pago',
      flex: 1.4,
      render: (r) => (
        <T style={{ color: theme.textMuted, fontSize: type.body }}>{longDate(r.date)}</T>
      ),
    },
    {
      key: 'symbol',
      label: 'Instrumento',
      flex: 3,
      render: (r) => (
        <View style={styles.inline}>
          <T style={{ color: theme.text, fontSize: type.body, fontWeight: '700' }}>{r.symbol}</T>
          <T numberOfLines={1} style={{ color: theme.textFaint, fontSize: type.micro, flexShrink: 1 }}>
            {r.name}
          </T>
        </View>
      ),
    },
    {
      key: 'original',
      label: 'Moneda original',
      align: 'right',
      flex: 1.2,
      optional: true,
      render: (r) => (
        <T style={[{ color: theme.textMuted, fontSize: type.body }, numericFont]}>
          {localPrice(r.original, r.currency)}
        </T>
      ),
    },
    {
      key: 'amount',
      label: 'Monto',
      align: 'right',
      flex: 1.3,
      render: (r) => (
        <T
          style={[
            { color: theme.positive, fontSize: type.body, fontWeight: '700' },
            numericFont,
          ]}
        >
          {money(r.amount)}
        </T>
      ),
    },
  ];

  return (
    <Sheet title="Dividendos" meta={`${rows.length} pagos recibidos`}>
      <View style={[styles.divHeader, isPhone && { flexDirection: 'column', gap: space.lg }]}>
        <View>
          <Kicker>Dividendos 12 meses</Kicker>
          <View style={{ marginTop: 6 }}>
            <Figure value={money(total12)} size={isPhone ? 28 : 38} />
          </View>
          <T style={{ color: theme.textMuted, fontSize: type.label, marginTop: 2 }}>
            {money(totalAll)} desde el inicio
          </T>
        </View>

        {/* Histograma mensual. Los meses sin pago se dibujan igual, en gris:
            un flujo de dividendos irregular es información, no un hueco. */}
        <View style={[styles.bars, isPhone && { width: '100%' }]}>
          {months.map((m) => (
            <View key={m.key} style={styles.barCol}>
              <View
                style={{
                  width: '100%',
                  height: Math.max(2, (m.value / maxMonth) * 82),
                  backgroundColor: m.value > 0 ? theme.accent : theme.grid,
                }}
              />
              <T style={{ color: theme.textFaint, fontSize: type.pico }}>{m.label}</T>
            </View>
          ))}
        </View>
      </View>

      <DataTable
        rows={rows}
        columns={columns}
        keyOf={(r) => r.id}
        empty="No hay dividendos cobrados en este alcance."
        renderPhone={(r) => (
          <View style={styles.phoneRow}>
            <View style={{ flex: 1 }}>
              <T style={{ color: theme.text, fontSize: type.body, fontWeight: '700' }}>
                {r.symbol}
              </T>
              <T style={{ color: theme.textFaint, fontSize: type.nano }}>{longDate(r.date)}</T>
            </View>
            <T
              style={[
                { color: theme.positive, fontSize: type.body, fontWeight: '700' },
                numericFont,
              ]}
            >
              {money(r.amount)}
            </T>
          </View>
        )}
      />
      <Note>
        Plata que ya está en la cuenta. Los pagos en dólares se convierten al tipo de cambio del día
        de pago. Ninguna app de corredora cuenta esto como rentabilidad.
      </Note>
    </Sheet>
  );
}

export function CajaTab({ data }: { data: FullSnapshot }) {
  const theme = useTheme();
  const rows = useMemo(() => buildCashRows(data.cashMovements), [data.cashMovements]);

  const deposits = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const withdrawals = rows.filter((r) => r.amount < 0).reduce((s, r) => s + r.amount, 0);

  /**
   * Las dos cajas, y la suma en pesos.
   *
   * No se deducen de los movimientos: la suma de aportes menos retiros da el
   * capital que entró a la cuenta, y casi todo ese dinero ya está en acciones.
   * Confundir las dos cifras hacía leer cientos de miles de pesos disponibles
   * donde hay unos pocos miles, así que el saldo viene de `balances`, que es lo
   * que la corredora declara como caja.
   */
  const cash = useMemo(() => buildCashBalance(data, data.balances), [data]);

  const nIn = rows.filter((r) => r.amount > 0).length;
  const nOut = rows.filter((r) => r.amount < 0).length;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const movesMeta = `${plural(nIn, 'transferencia', 'transferencias')} por ${money(deposits)} · ${plural(nOut, 'retiro', 'retiros')} por ${money(Math.abs(withdrawals))}`;

  const kpis: Kpi[] = [
    {
      label: 'Caja total',
      value: money(cash.total),
      sub: cash.usd > 0 ? 'pesos y dólares, todo a pesos' : 'disponible para invertir',
      color: theme.accentDeep,
    },
    {
      label: 'Caja en pesos',
      value: money(cash.clp),
      sub:
        cash.clpPending > 0
          ? `incluye ${money(cash.clpPending)} liquidando`
          : 'para la bolsa chilena',
    },
    {
      label: 'Caja en dólares',
      value: dollars(cash.usd),
      sub: cash.sell > 0 ? `≈ ${money(cash.usdInClp)} a $${rateFmt(cash.sell)}` : 'para la bolsa gringa',
    },
    {
      label: 'Aporte neto',
      value: money(deposits + withdrawals),
      sub: 'capital propio puesto en la cuenta',
    },
  ];

  const columns: Column<CashRow>[] = [
    {
      key: 'date',
      label: 'Fecha',
      flex: 1.4,
      render: (r) => (
        <T style={{ color: theme.textMuted, fontSize: type.body }}>{longDate(r.date)}</T>
      ),
    },
    {
      key: 'kind',
      label: 'Concepto',
      flex: 1.4,
      render: (r) => (
        <Tag
          label={r.kind === 'deposit' ? 'APORTE' : 'RETIRO'}
          bg={r.kind === 'deposit' ? theme.accentSoft : theme.surfaceAlt}
          fg={r.kind === 'deposit' ? theme.accentDeep : theme.negative}
        />
      ),
    },
    {
      key: 'currency',
      label: 'Moneda',
      flex: 1,
      optional: true,
      render: (r) => (
        <T style={{ color: theme.textFaint, fontSize: type.micro }}>{r.currency}</T>
      ),
    },
    {
      key: 'amount',
      label: 'Monto',
      align: 'right',
      flex: 1.3,
      render: (r) => (
        <T
          style={[
            {
              color: r.amount >= 0 ? theme.text : theme.negative,
              fontSize: type.body,
              fontWeight: '700',
            },
            numericFont,
          ]}
        >
          {signedMoney(r.amount)}
        </T>
      ),
    },
    {
      key: 'balance',
      label: 'Aporte acumulado',
      align: 'right',
      flex: 1.5,
      render: (r) => (
        <T style={[{ color: theme.textMuted, fontSize: type.body }, numericFont]}>
          {money(r.balance)}
        </T>
      ),
    },
  ];

  return (
    <View>
      <KpiStrip items={kpis} />

      <Sheet title="Composición de la caja" meta="Qué parte está en cada moneda y qué cuesta juntarlas">
        <Panel>
          <Row
            label="Pesos liquidados"
            value={money(cash.clpSettled)}
            hint="disponibles para invertir o retirar hoy"
          />
          {cash.clpPending > 0 ? (
            <Row
              label="Pesos por liquidar"
              value={money(cash.clpPending)}
              hint="ventas hechas: ya se pueden reinvertir, se retiran en 2 días hábiles"
            />
          ) : null}
          <Row label="Caja en pesos" value={money(cash.clp)} emphasis />

          <Divider />

          <Row label="Caja en dólares" value={dollars(cash.usd)} hint="para comprar en la bolsa gringa" />
          <Row
            label="Tipo de cambio de venta"
            value={cash.sell > 0 ? `$${rateFmt(cash.sell)}` : '—'}
            hint={cash.mid > 0 ? `mid $${rateFmt(cash.mid)} menos $${FX_SPREAD_CLP} de spread` : undefined}
          />
          <Row
            label="Equivalente en pesos"
            value={money(cash.usdInClp)}
            emphasis
            valueColor={theme.textMuted}
          />

          <Divider />

          <Row label="Caja total en pesos" value={money(cash.total)} emphasis valueColor={theme.accentDeep} />
        </Panel>

        <Note>
          Son dos cajas de verdad, no dos vistas de la misma: con los pesos se compra en la bolsa
          chilena y con los dólares en la gringa. El total las junta al precio al que Zesty compra
          los dólares —el mid menos ${FX_SPREAD_CLP} por dólar—, que es lo que realmente llegaría a
          la cuenta en pesos, no lo que marca la pizarra. Pasar toda la caja en dólares costaría{' '}
          {money(cash.spreadCost)} de spread.
          {cash.clpPending > 0
            ? ' El monto por liquidar cuenta como caja porque ya se puede reinvertir; lo que no se puede todavía es retirarlo ni cambiarlo a dólares.'
            : ''}
        </Note>
      </Sheet>

      <Sheet title="Aportes y retiros" meta={movesMeta}>
        <DataTable
          rows={rows}
          columns={columns}
          keyOf={(r) => r.id}
          empty="No hay movimientos de caja registrados."
          renderPhone={(r) => (
            <View style={styles.phoneRow}>
              <View style={{ flex: 1, gap: 4 }}>
                <Tag
                  label={r.kind === 'deposit' ? 'APORTE' : 'RETIRO'}
                  bg={r.kind === 'deposit' ? theme.accentSoft : theme.surfaceAlt}
                  fg={r.kind === 'deposit' ? theme.accentDeep : theme.negative}
                />
                <T style={{ color: theme.textFaint, fontSize: type.nano }}>
                  {longDate(r.date)} · aportado {money(r.balance)}
                </T>
              </View>
              <T
                style={[
                  {
                    color: r.amount >= 0 ? theme.text : theme.negative,
                    fontSize: type.body,
                    fontWeight: '700',
                  },
                  numericFont,
                ]}
              >
                {signedMoney(r.amount)}
              </T>
            </View>
          )}
        />
        <Note>
          La columna acumula capital aportado, no efectivo: mide cuánta plata propia entró a la
          cuenta, no cuánta queda sin invertir. Las dos cifras no se parecen y no tienen por qué
          hacerlo — hoy la caja son {money(cash.total)} y el aporte neto{' '}
          {money(deposits + withdrawals)}, porque lo que se ganó vendiendo también está en la
          caja. La rentabilidad de todo el tablero se mide contra el aporte neto, que es el
          denominador honesto: de cada peso que pusiste, cuánto tienes hoy.
        </Note>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'baseline', gap: 7, flexShrink: 1 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  divHeader: { flexDirection: 'row', gap: space.huge, marginBottom: space.xl },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 104 },
  barCol: { flex: 1, alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
});
