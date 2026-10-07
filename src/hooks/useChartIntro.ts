import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

import { prefersReducedMotion } from '@/lib/motion';

/**
 * Progreso 0 → 1 para la entrada de un gráfico.
 *
 * Un valor único por gráfico, del que cuelgan todas las piezas: la línea que se
 * dibuja, el relleno que aparece detrás, los puntos de compra. Compartir un
 * solo reloj es lo que hace que el conjunto se lea como un movimiento y no como
 * cuatro animaciones que compiten.
 *
 * `useNativeDriver` va en false a propósito: lo que se anima son atributos de
 * SVG —`strokeDashoffset`, radios, opacidades de nodos gráficos— y esos no
 * existen en el hilo nativo de animaciones, que solo sabe de transformaciones y
 * opacidad de vistas.
 *
 * El arranque espera a `ready` porque los gráficos miden su ancho con
 * `onLayout`: si el reloj partiera al montar, la mitad de la animación
 * transcurriría antes de que exista geometría que dibujar.
 *
 * `replayKey` vuelve a correr la animación cuando cambia. Sirve para los filtros
 * que rehacen el gráfico sin cambiar de componente —pasar de Todo a Nacional es
 * otra cartera y merece armarse de nuevo— sin pagar el desmontaje, que obligaría
 * a medir el ancho de nuevo.
 */
export function useChartIntro(ready = true, duration = 850, replayKey?: string | number) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!ready) return;

    // Quien pidió menos movimiento en el sistema ve el gráfico armado, no una
    // versión más lenta de la animación.
    if (prefersReducedMotion()) {
      progress.setValue(1);
      return;
    }

    // Se rebobina a mano: el gráfico no se desmonta al cambiar de alcance
    // —desmontarlo le haría perder el ancho que midió con onLayout y
    // parpadearía—, así que nadie más devuelve el reloj a cero.
    progress.setValue(0);

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();

    return () => animation.stop();
  }, [ready, replayKey, progress, duration]);

  return progress;
}

/**
 * Tramo del reloj en que una pieza entra, como rango válido para `interpolate`.
 *
 * `interpolate` exige un rango estrictamente creciente y dentro de [0,1]; un
 * segmento diminuto de la dona o un punto en el extremo derecho de la línea
 * producen extremos iguales y revientan. Esto los separa lo mínimo.
 */
export function revealWindow(from: number, to: number): [number, number] {
  const a = Math.max(0, Math.min(0.999, from));
  const b = Math.max(a + 0.001, Math.min(1, to));
  return [a, b];
}
