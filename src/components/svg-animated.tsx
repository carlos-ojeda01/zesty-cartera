import { forwardRef, type ComponentType } from 'react';
import { Animated } from 'react-native';
import { Circle, G, Path } from 'react-native-svg';

/**
 * Versiones animables de los nodos de SVG que usa el tablero.
 *
 * `Animated.createAnimatedComponent` agrega `collapsable={false}`, una pista
 * para el optimizador de vistas de Android. react-native-svg la reenvía tal
 * cual al nodo del DOM, donde React la rechaza —no es un atributo booleano
 * válido— y ensucia la consola en cada render. Descartarla en un envoltorio
 * resuelve el ruido sin parchear la librería ni renunciar a animar.
 */
function animatedSvg<P extends object>(Comp: ComponentType<P>, name: string) {
  const Clean = forwardRef<unknown, P & { collapsable?: boolean }>(function Clean(
    { collapsable: _ignored, ...rest },
    ref,
  ) {
    // El cast existe solo para pasar la ref: ComponentType<P> no la declara,
    // pero los nodos de react-native-svg sí la aceptan y Animated la necesita
    // para escribir props sin volver a renderizar.
    const Node = Comp as ComponentType<P & { ref?: unknown }>;
    return <Node ref={ref} {...(rest as P)} />;
  });
  Clean.displayName = name;
  return Animated.createAnimatedComponent(Clean);
}

export const AnimatedPath = animatedSvg(Path, 'AnimatedPath');
export const AnimatedCircle = animatedSvg(Circle, 'AnimatedCircle');
export const AnimatedG = animatedSvg(G, 'AnimatedG');
