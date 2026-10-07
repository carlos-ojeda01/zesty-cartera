import { useWindowDimensions } from 'react-native';

import { BREAKPOINTS } from '@/theme/tokens';

export type Size = 'phone' | 'tablet' | 'desktop';

export interface Layout {
  size: Size;
  width: number;
  /** Atajos, porque `layout.size === 'phone'` aparece decenas de veces. */
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Hay ancho para las columnas opcionales de las tablas. */
  isRoomy: boolean;
  /** Margen lateral del contenido. En el teléfono el aire cuesta píxeles. */
  gutter: number;
}

/**
 * Un solo punto donde se decide el formato.
 *
 * `useWindowDimensions` se re-evalúa al rotar el teléfono y al arrastrar la
 * ventana del navegador, así que el tablero responde en vivo sin escuchar
 * `resize` a mano. Se prefiere sobre las media queries de CSS porque aquí las
 * decisiones no son solo de estilo: en teléfono la tabla de posiciones deja de
 * ser una tabla y pasa a ser una lista, y eso es un árbol de componentes
 * distinto, no un `display:none`.
 */
export function useLayout(): Layout {
  const { width } = useWindowDimensions();

  const size: Size =
    width >= BREAKPOINTS.desktop ? 'desktop' : width >= BREAKPOINTS.tablet ? 'tablet' : 'phone';

  return {
    size,
    width,
    isPhone: size === 'phone',
    isTablet: size === 'tablet',
    isDesktop: size === 'desktop',
    isRoomy: width >= BREAKPOINTS.roomy,
    gutter: size === 'phone' ? 18 : 28,
  };
}
