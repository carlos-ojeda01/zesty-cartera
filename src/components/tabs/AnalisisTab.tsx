import { View } from 'react-native';

import { SettingsCard } from '@/components/SettingsCard';
import { ChileSections } from '@/components/sections/ChileSections';
import { GlobalSections } from '@/components/sections/GlobalSections';
import { UsaSections } from '@/components/sections/UsaSections';
import { SectionTitle } from '@/components/ui';
import { useLayout } from '@/hooks/useLayout';
import type { FullSnapshot } from '@/hooks/useSnapshot';
import type { Scope } from '@/lib/finance';
import { space } from '@/theme/tokens';

/**
 * Todo el análisis que no cabe en una cartola: el costo real de operar, el
 * puente del dólar, el detalle del benchmark y los ajustes.
 *
 * El mockup no trae esta pestaña —llega hasta Caja—, pero tampoco tiene dónde
 * poner estos bloques, y son la parte del tablero que ninguna app de corredora
 * muestra. Se suman como una quinta pestaña en vez de perderse: el patrón de
 * navegación ya existe y el contenido no cambia de naturaleza, solo de casa.
 */
export function AnalisisTab({ data, scope }: { data: FullSnapshot; scope: Scope }) {
  const { gutter } = useLayout();

  return (
    <View style={{ paddingHorizontal: gutter, paddingTop: space.xxl, paddingBottom: space.xxl }}>
      <SectionTitle
        meta={
          scope === 'cl'
            ? 'mercado nacional'
            : scope === 'us'
              ? 'mercado internacional'
              : 'cartera consolidada'
        }
      >
        Análisis
      </SectionTitle>

      <View style={{ gap: space.xl }}>
        {scope === 'all' && <GlobalSections data={data} />}
        {scope === 'cl' && <ChileSections data={data} />}
        {scope === 'us' && <UsaSections data={data} />}
        <SettingsCard data={data} />
      </View>
    </View>
  );
}
