import { useMemo, useState } from 'react';

import type { MacroItem, TabKey } from '@/components/Chrome';
import { FadeIn } from '@/components/FadeIn';
import { Screen } from '@/components/Screen';
import { AnalisisTab } from '@/components/tabs/AnalisisTab';
import { CajaTab, DividendosTab, MovimientosTab } from '@/components/tabs/Cartolas';
import { ResumenTab } from '@/components/tabs/ResumenTab';
import { useSnapshot } from '@/hooks/useSnapshot';
import {
  buildPositionRows,
  buyRate,
  FX_TICKER,
  quote,
  sellRate,
  type Scope,
} from '@/lib/finance';
import { localDay, longDate, percent, rate, signedMoney, sinceNow } from '@/lib/format';

/** Días completos desde una marca de tiempo. Sin marca, un número grande. */
function daysSince(iso: string | null | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - then) / 86400000);
}

/**
 * El tablero completo.
 *
 * Aquí viven solo dos piezas de estado: qué pestaña se mira y qué alcance de
 * mercado se aplica. El alcance es global a propósito —filtra el resumen, los
 * movimientos y los dividendos a la vez—, porque cambiar de Todo a Nacional no
 * es irse a otra parte sino recortar la misma cartera. La pestaña Caja lo
 * ignora: los aportes entran en pesos a la cuenta, antes de que exista la
 * distinción entre mercado nacional e internacional.
 */
export default function Dashboard() {
  const { data, loading, refreshing, error, reload } = useSnapshot();
  const [tab, setTab] = useState<TabKey>('resumen');
  const [scope, setScope] = useState<Scope>('all');

  /**
   * Franja de contexto de mercado.
   *
   * Solo lo que los datos alimentan de verdad: el dólar y sus dos puntas en
   * Zesty (donde se va el spread de $10), el ETF del IPSA y el estado de las
   * dos sincronizaciones. Nada de casillas rellenas con cifras inventadas.
   */
  const macro = useMemo<MacroItem[]>(() => {
    if (!data) return [];

    const fx = quote(data, FX_TICKER);
    const benchmarkAsset = data.assets.find((a) => a.is_benchmark);
    const ipsa = benchmarkAsset ? quote(data, benchmarkAsset.yahoo_ticker) : null;
    const mid = fx.close ?? 0;

    /**
     * Lo que el movimiento del dólar le hizo a la cartera, en pesos.
     *
     * El porcentaje solo, sin monto, no dice nada: un 1% del dólar pesa muy
     * distinto con $375.000 en papeles gringos que con la cartera entera en
     * pesos. Se mide sobre el tramo en dólares valorizado como se liquidaría
     * hoy, que es el mismo criterio que usa el resto del tablero.
     */
    const usdSleeve = buildPositionRows(data, { scope: 'us', usdMode: 'real' }).totals.value;
    const fxEffect =
      fx.changePct !== null && usdSleeve > 0
        ? (usdSleeve * fx.changePct) / (1 + fx.changePct)
        : null;

    const items: MacroItem[] = [
      {
        label: 'Dólar observado',
        value: mid ? `$${rate(mid)}` : '—',
        delta: fx.changePct !== null ? percent(fx.changePct) : undefined,
        tone: fx.changePct === null ? null : fx.changePct >= 0 ? 'pos' : 'neg',
        note:
          fxEffect !== null
            ? `${signedMoney(fxEffect)} en tu cartera${fx.date ? ` · cierre ${longDate(fx.date)}` : ''}`
            : fx.date
              ? `cierre ${longDate(fx.date)}`
              : undefined,
      },
      {
        label: 'Dólar Zesty compra',
        value: mid ? `$${rate(buyRate(mid))}` : '—',
        note: 'mid + $10 de spread',
      },
      {
        label: 'Dólar Zesty venta',
        value: mid ? `$${rate(sellRate(mid))}` : '—',
        note: 'a lo que se liquida hoy',
      },
    ];

    if (ipsa?.close) {
      /**
       * Variación del día, contra el cierre publicado anterior.
       *
       * Es la definición que usa cualquier corredora y la que se espera de una
       * casilla que dice "IPSA". La versión estricta —comparar solo contra la
       * última sesión con transacciones reales— se sigue usando en la tabla de
       * posiciones, donde la pregunta es otra: si un precio sirve para sumar.
       * Aquí dejaba la casilla anunciando julio en septiembre.
       *
       * Cuando el cierre anterior venía arrastrado por el proveedor, el
       * porcentaje es el mismo pero el movimiento se acumuló en silencio
       * durante el relleno, y la nota lo dice en vez de disfrazarlo.
       */
      const change = ipsa.dailyChangePct;
      items.push({
        label: benchmarkAsset?.symbol ?? 'IPSA',
        value: rate(ipsa.close),
        delta: change !== null ? percent(change) : undefined,
        tone: change === null ? null : change >= 0 ? 'pos' : 'neg',
        note: ipsa.prevWasCarried
          ? 'el cierre previo venía arrastrado'
          : 'el índice contra el que te mides',
      });
    }

    /**
     * Dos relojes, no uno.
     *
     * Los precios se refrescan con `npm run precios` (y `npm run dashboard` lo
     * repite solo cada 15 minutos). La cartera no —posiciones, saldos y
     * operaciones solo entran por el MCP de Zesty, que necesita una sesión del
     * agente y no se puede llamar desde el navegador—. Mostrar una sola fecha
     * hacía que la corrida de precios de hace un minuto tapara una cartera de
     * hace tres días, que es justo lo que hay que saber antes de creerle al
     * patrimonio.
     */
    const yahoo = data.syncs?.yahoo ?? null;
    const zesty = data.syncs?.zesty ?? null;

    if (yahoo) {
      const ok = yahoo.status === 'ok';
      items.push({
        label: 'Precios',
        value: sinceNow(yahoo.ran_at),
        // Una sincronización parcial es la causa de que haya precios
        // arrastrados; que se vea aquí evita tener que deducirlo de la tabla.
        delta: ok ? undefined : 'parcial',
        tone: ok ? null : 'neg',
        note: `Yahoo · ${longDate(localDay(yahoo.ran_at))}`,
      });
    }

    // Un día de atraso todavía describe bien la cartera: la corredora liquida
    // al día siguiente y las posiciones no se mueven solas. Dos ya no.
    const carteraVieja = daysSince(zesty?.ran_at) >= 2;
    items.push({
      label: 'Cartera',
      value: sinceNow(zesty?.ran_at),
      delta: carteraVieja ? 'revisar' : undefined,
      tone: carteraVieja ? 'neg' : null,
      note: 'Zesty · se actualiza desde tu agente',
    });

    return items;
  }, [data]);

  /**
   * El rótulo dice la fecha de los precios, no la de la sincronización.
   *
   * Son cosas distintas: una corrida de madrugada trae los cierres del día
   * anterior, y el encabezado no debe prometer un día que todavía no existe en
   * la tabla. Cuándo corrió el proceso ya se cuenta en su propia casilla.
   */
  const latestPriceDate = useMemo(() => {
    let max: string | null = null;
    for (const p of data?.prices ?? []) {
      if (!max || p.price_date > max) max = p.price_date;
    }
    return max;
  }, [data]);

  const carteraAl = data?.syncs?.zesty?.ran_at ?? null;

  const subtitle = [
    data?.demo ? 'Cartera de ejemplo (ficticia)' : 'Cuenta Zesty',
    latestPriceDate ? `precios al ${longDate(latestPriceDate)}` : null,
    carteraAl ? `cartera al ${longDate(localDay(carteraAl))}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen
      macro={macro}
      subtitle={subtitle}
      tab={tab}
      onTab={setTab}
      loading={loading}
      refreshing={refreshing}
      error={error}
      onRefresh={reload}
    >
      {data && (
        // La clave rearma el contenido al cambiar de pestaña: eso dispara el fundido.
        <FadeIn key={tab}>
          {tab === 'resumen' && <ResumenTab data={data} scope={scope} onScope={setScope} />}
          {tab === 'movs' && <MovimientosTab data={data} scope={scope} />}
          {tab === 'divs' && <DividendosTab data={data} scope={scope} />}
          {tab === 'caja' && <CajaTab data={data} />}
          {tab === 'analisis' && <AnalisisTab data={data} scope={scope} />}
        </FadeIn>
      )}
    </Screen>
  );
}
