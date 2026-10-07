import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DonutChart } from '@/components/DonutChart';
import { PerformanceChart, type ChartMarker } from '@/components/PerformanceChart';
import { PositionsTable } from '@/components/PositionsTable';
import {
  CheckToggle,
  Delta,
  Figure,
  Kicker,
  KpiStrip,
  Note,
  SectionTitle,
  Segmented,
  T,
  type Kpi,
} from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import type { FullSnapshot } from '@/hooks/useSnapshot';
import {
  BENCHMARKS,
  buildCashBalance,
  buildDividendRows,
  buildMoveRows,
  buildPositionRows,
  buildSeries,
  dividendsByMonth,
  slicePeriod,
  type BenchmarkKey,
  type Period,
  type Scope,
} from '@/lib/finance';
import { longDate, money, percent, signedMoney } from '@/lib/format';
import { usePreferences } from '@/state/Preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { space, type } from '@/theme/tokens';

const PERIODS: readonly { value: Period; label: string }[] = [
  { value: '1M', label: '1M' },
  { value: '3M', label: '3M' },
  { value: '6M', label: '6M' },
  { value: '1A', label: '1A' },
  { value: 'TODO', label: 'TODO' },
];

const VIEWS = [
  { value: 'line' as const, label: 'Línea' },
  { value: 'donut' as const, label: 'Circular' },
];

const BENCHMARK_OPTIONS: readonly { value: BenchmarkKey; label: string }[] = [
  { value: 'ipsa', label: BENCHMARKS.ipsa.label },
  { value: 'sp500', label: BENCHMARKS.sp500.label },
  { value: 'none', label: BENCHMARKS.none.label },
];

/**
 * La pestaña principal: cifra grande, curva, indicadores y posiciones.
 *
 * El alcance (Todo / Nacional / Internacional) lo controla el contenedor
 * porque también filtra Movimientos y Dividendos. Lo que vive aquí es lo que
 * solo afecta a esta vista: el período, la forma del gráfico y qué series se
 * dibujan encima.
 */
export function ResumenTab({
  data,
  scope,
  onScope,
}: {
  data: FullSnapshot;
  scope: Scope;
  onScope: (s: Scope) => void;
}) {
  const theme = useTheme();
  const { isPhone, isDesktop, gutter } = useLayout();
  const { benchmark, usdMode, period, set } = usePreferences();

  const [view, setView] = useState<'line' | 'donut'>('line');
  const [showMarkers, setShowMarkers] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { rows, totals } = useMemo(
    () => buildPositionRows(data, { scope, usdMode }),
    [data, scope, usdMode],
  );

  const { points, missingPrices } = useMemo(
    () => buildSeries(data, { scope, usdMode, benchmark }),
    [data, scope, usdMode, benchmark],
  );

  const visible = useMemo(() => slicePeriod(points, period), [points, period]);

  const markers = useMemo<ChartMarker[]>(
    () =>
      buildMoveRows(data, scope).map((m) => ({
        date: m.date,
        side: m.side,
        symbol: m.symbol,
        amount: Math.abs(m.amount),
      })),
    [data, scope],
  );

  const dividendRows = useMemo(() => buildDividendRows(data, scope), [data, scope]);

  const div12 = useMemo(
    () => dividendsByMonth(dividendRows).reduce((s, m) => s + m.value, 0),
    [dividendRows],
  );

  /**
   * El alfa se mide contra el CAPITAL INVERTIDO, no contra el valor que tenía
   * la cartera al empezar la ventana. La diferencia no es cosmética: el
   * patrimonio sube cuando uno deposita plata, así que "cuánto subió en seis
   * meses" mezcla lo que rindió la inversión con lo que se aportó del bolsillo.
   */
  const alpha = useMemo(() => {
    if (benchmark === 'none') return null;
    const last = points[points.length - 1];
    if (!last || last.invested <= 0 || last.benchmark <= 0) return null;
    return last.portfolio / last.invested - last.benchmark / last.invested;
  }, [points, benchmark]);

  /**
   * La caja que corresponde al alcance elegido.
   *
   * En 'Nacional' solo los pesos y en 'Internacional' solo los dólares —ya
   * traídos a pesos al tipo de cambio de venta—, porque cada caja compra en su
   * propia bolsa. Mostrar la caja total dentro de un alcance recortado haría
   * que las tres vistas no sumaran.
   */
  const cash = useMemo(() => buildCashBalance(data, data.balances), [data]);
  const cashInScope = scope === 'cl' ? cash.clp : scope === 'us' ? cash.usdInClp : cash.total;

  // Al arrastrar el dedo o mover el puntero, el encabezado se mueve con él.
  const cursor = activeIndex !== null ? visible[activeIndex] : null;
  const shown = cursor ?? visible[visible.length - 1] ?? null;

  const gainPct = shown && shown.invested > 0 ? shown.portfolio / shown.invested - 1 : null;

  /**
   * Lo que hay en instrumentos, que es lo que mide la línea del gráfico.
   *
   * La caja NO tiene serie histórica —`balances` es una foto, no un registro—
   * así que solo se puede sumar al valor de hoy. Mientras el dedo recorre el
   * gráfico se muestra el valor de los papeles de ese día y la etiqueta lo
   * dice; al soltar, el encabezado vuelve al patrimonio completo.
   */
  const instruments = shown ? shown.portfolio : totals.value;
  const heroValue = cursor ? cursor.portfolio : instruments + cashInScope;

  const kpis: Kpi[] = [
    {
      label: 'Rentabilidad total',
      value: percent(totals.totalPct, 1),
      sub: `${signedMoney(totals.value - totals.invested)} sobre el capital`,
      color: (totals.totalPct ?? 0) >= 0 ? theme.positive : theme.negative,
    },
    {
      label: 'Dividendos 12 meses',
      value: money(div12),
      sub: `Yield sobre costo ${percent(totals.yoc, 2).replace('+', '')}`,
    },
    {
      label: benchmark === 'none' ? 'Alfa' : 'Alfa vs ' + BENCHMARKS[benchmark].label,
      value: benchmark === 'none' ? '—' : percent(alpha, 1),
      sub:
        benchmark === 'none'
          ? 'elige un índice para comparar'
          : 'contra comprar ' + BENCHMARKS[benchmark].full + ' en las mismas fechas',
      // Sin índice el valor es una raya, y una raya verde parecería un dato.
      color:
        benchmark === 'none' ? undefined : (alpha ?? 0) >= 0 ? theme.positive : theme.negative,
    },
    {
      label: 'Variación del día',
      value: totals.dayCoverage > 0 ? signedMoney(totals.dayAbs) : '—',
      // Cuando parte de la cartera no tiene precio del día, la cifra sigue
      // siendo cierta pero solo sobre el tramo que sí se actualizó, y decirlo
      // importa más que mostrar un número redondo.
      sub:
        totals.dayCoverage >= 0.999
          ? `${percent(totals.dayPct, 2)} · último cierre`
          : totals.dayCoverage > 0
            ? `${percent(totals.dayPct, 2)} sobre el ${percent(totals.dayCoverage, 0).replace('+', '')} de la cartera con precio de hoy`
            : 'ningún instrumento tiene precio de hoy',
      color: totals.dayAbs >= 0 ? theme.positive : theme.negative,
    },
  ];

  const scopeName = scope === 'cl' ? 'nacional' : scope === 'us' ? 'internacional' : 'consolidado';

  return (
    <View>
      {/* ─── encabezado con la cifra grande ─── */}
      <View
        style={[
          styles.hero,
          { paddingHorizontal: gutter, paddingTop: isPhone ? 20 : 30 },
          // El aire de 44px entre la cifra y los controles es del mockup de
          // escritorio, donde van uno al lado del otro. Apilados deja un hueco.
          isPhone && { gap: space.lg, paddingBottom: space.lg },
        ]}
      >
        <View style={{ flexShrink: 1 }}>
          <Kicker>
            {cursor
              ? `En instrumentos · ${longDate(cursor.date)}`
              : scope === 'cl'
                ? 'Patrimonio nacional'
                : scope === 'us'
                  ? 'Patrimonio internacional'
                  : 'Patrimonio total'}
          </Kicker>
          <View style={{ marginTop: 8 }}>
            <Figure value={money(heroValue)} size={isPhone ? type.heroSm : type.hero} />
          </View>
          {!cursor && cashInScope > 0 ? (
            <T style={{ color: theme.textMuted, fontSize: isPhone ? 12 : 14, marginTop: 6 }}>
              {money(instruments)} en instrumentos + {money(cashInScope)} en caja
            </T>
          ) : null}
          <View style={styles.deltaRow}>
            <Delta value={gainPct ?? totals.totalPct} size={isPhone ? 14 : 19} digits={1} />
            <T style={{ color: theme.textMuted, fontSize: isPhone ? 12 : 14 }}>
              {signedMoney(shown ? shown.portfolio - shown.invested : totals.value - totals.cost)}
            </T>
            {!isPhone && (
              <T style={{ color: theme.textFaint, fontSize: type.micro }}>
                sobre {money(shown ? shown.invested : totals.cost)} invertidos en instrumentos
              </T>
            )}
          </View>
        </View>

        {/* En 393px los dos selectores no caben en una fila: "Internacional"
            se corta contra el borde. Apilados ocupan dos renglones y cada
            opción queda con ancho de pulgar. */}
        <View style={[styles.heroControls, isPhone && styles.heroControlsPhone]}>
          <View style={isPhone ? { width: '100%' } : undefined}>
            <View style={{ marginBottom: 6 }}>
              <Kicker>Alcance</Kicker>
            </View>
            <Segmented
              options={[
                { value: 'all' as Scope, label: 'Todo' },
                { value: 'cl' as Scope, label: 'Nacional' },
                { value: 'us' as Scope, label: 'Internacional' },
              ]}
              value={scope}
              onChange={onScope}
              stretch={isPhone}
            />
          </View>
          <View style={isPhone ? { width: '100%' } : undefined}>
            <View style={{ marginBottom: 6 }}>
              <Kicker>Vista</Kicker>
            </View>
            <Segmented options={VIEWS} value={view} onChange={setView} stretch={isPhone} />
          </View>
        </View>
      </View>

      {/* ─── gráfico ─── */}
      {view === 'line' ? (
        visible.length >= 2 ? (
          <View style={{ paddingHorizontal: gutter }}>
            <PerformanceChart
              points={visible}
              markers={markers}
              showMarkers={showMarkers}
              showBenchmark={benchmark !== 'none'}
              activeIndex={activeIndex}
              onScrub={setActiveIndex}
              replayKey={scope}
            />

            <View style={[styles.controls, { borderBottomColor: theme.border }]}>
              <Segmented
                options={PERIODS}
                value={period}
                onChange={(v) => {
                  // El índice del cursor pertenece al tramo anterior; si no se
                  // limpia, al cambiar de período el encabezado muestra la
                  // cifra de otro día durante un frame.
                  setActiveIndex(null);
                  set('period', v);
                }}
                stretch={isPhone}
              />

              {/* Sin ancho propio, el contenedor no envuelve y el último
                  control se corta contra el borde en teléfono. */}
              <View style={[styles.toggles, isPhone && { width: '100%', rowGap: space.md }]}>
                <CheckToggle
                  label="Compras y ventas"
                  checked={showMarkers}
                  onToggle={() => setShowMarkers((v) => !v)}
                />
                <View style={styles.benchmarkPicker}>
                  <T style={{ color: theme.textMuted, fontSize: type.label }}>Comparar con</T>
                  <Segmented
                    options={BENCHMARK_OPTIONS}
                    value={benchmark}
                    onChange={(v) => set('benchmark', v)}
                  />
                </View>
              </View>

              {isDesktop && (
                <View style={styles.legend}>
                  <LegendItem color={theme.accent} label="Cartera" />
                  {benchmark !== 'none' && (
                    <LegendItem
                      color={theme.benchmark}
                      label={BENCHMARKS[benchmark].label}
                      dashed
                    />
                  )}
                  <LegendItem color={theme.accent} label="Compra" dot />
                  <LegendItem color={theme.accent} label="Venta" dot hollow />
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={{ paddingHorizontal: gutter, paddingVertical: space.xl }}>
            <T style={{ color: theme.textMuted, fontSize: type.body }}>
              Todavía no hay suficientes datos para dibujar la serie.
            </T>
          </View>
        )
      ) : (
        <View
          style={{
            paddingHorizontal: gutter,
            paddingBottom: space.xl,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          }}
        >
          <DonutChart
            rows={rows}
            total={totals.value + cashInScope}
            cash={
              cashInScope > 0
                ? {
                    value: cashInScope,
                    label:
                      scope === 'us'
                        ? 'Dólares sin invertir'
                        : scope === 'cl'
                          ? 'Pesos sin invertir'
                          : 'Pesos y dólares sin invertir',
                  }
                : undefined
            }
            replayKey={scope}
          />
        </View>
      )}

      <KpiStrip items={kpis} />

      {/* ─── posiciones ─── */}
      <View style={{ paddingHorizontal: gutter, paddingTop: space.xxl, paddingBottom: space.xxl }}>
        <SectionTitle
          meta={
            isPhone
              ? undefined
              : `${rows.length} instrumentos · ordena por cualquier columna`
          }
        >
          Posiciones
        </SectionTitle>
        <PositionsTable rows={rows} totals={totals} />

        {totals.staleCount > 0 && (
          <Note>
            {totals.staleCount === 1 ? 'Un instrumento trae' : `${totals.staleCount} instrumentos traen`}{' '}
            un precio cuya sesión anterior real es del{' '}
            {totals.stalestDate ? longDate(totals.stalestDate) : 'pasado'}: entre medio la
            sincronización arrastró el último cierre conocido en vez de traer datos nuevos. Ese
            salto no es una variación diaria, así que la columna «Var. día» queda en «—» para esas
            filas en vez de mostrar un porcentaje que engaña.
          </Note>
        )}

        {missingPrices.length > 0 && (
          <Note>
            Sin serie de precios para {missingPrices.join(', ')}: se valoriza a costo, por lo que
            ese tramo del gráfico aparece plano.
          </Note>
        )}
        <Note>
          El capital invertido ({money(totals.invested)}) incluye comisiones e IVA de cada
          operación: es plata que salió de la cuenta para poder invertir y que al vender no vuelve,
          así que resta rentabilidad real. Los dividendos cobrados no se suman aparte, porque
          financiaron compras posteriores que ya están dentro de estas posiciones.
        </Note>

        {Math.abs(totals.realized) >= 1 && (
          <Note>
            Ese capital no es la simple suma del costo de las seis posiciones abiertas
            ({money(totals.cost)}): descuenta {money(Math.abs(totals.realized))} de resultado ya{' '}
            {totals.realized >= 0 ? 'ganado' : 'perdido'} en papeles que cerraste. Por eso la
            rentabilidad del pie de la tabla es la misma cifra que la de arriba y no un promedio de
            las filas.
          </Note>
        )}

        <Note>
          Totales del alcance {scopeName}. El tramo en dólares se valoriza{' '}
          {usdMode === 'real'
            ? 'descontando el spread de venta, que es la plata que llegaría a la cuenta'
            : 'al tipo de cambio de mercado, sin descontar el spread'}
          .
        </Note>
      </View>
    </View>
  );
}

function LegendItem({
  color,
  label,
  dashed = false,
  dot = false,
  hollow = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
  dot?: boolean;
  hollow?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.legendItem}>
      {dot ? (
        <View
          style={{
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: hollow ? theme.bg : color,
            borderWidth: hollow ? 2 : 0,
            borderColor: color,
          }}
        />
      ) : (
        <View
          style={{
            width: 16,
            height: dashed ? 0 : 2.4,
            backgroundColor: dashed ? undefined : color,
            borderTopWidth: dashed ? 1.5 : 0,
            borderColor: color,
            borderStyle: dashed ? 'dashed' : 'solid',
          }}
        />
      )}
      <T style={{ color: theme.textMuted, fontSize: type.micro }}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: space.huge,
    paddingBottom: space.xl,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.md,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  heroControls: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
  },
  heroControlsPhone: {
    marginLeft: 0,
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space.md,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xl,
    borderBottomWidth: 1,
    flexWrap: 'wrap',
  },
  toggles: { flexDirection: 'row', gap: space.xl, flexWrap: 'wrap', alignItems: 'center' },
  benchmarkPicker: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  legend: { marginLeft: 'auto', flexDirection: 'row', gap: 18, alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
