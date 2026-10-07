import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from 'react-native';

import { prefersReducedMotion } from '@/lib/motion';

/**
 * Entrada suave: el contenido aparece con un fundido y sube unos pocos
 * píxeles.
 *
 * En web el Stack de expo-router cambia de pantalla sin transición: la
 * pantalla nueva reemplaza a la anterior de golpe, y se siente brusco. Este fundido corto (320 ms, salida cúbica) da continuidad sin hacer
 * esperar: el marco —cabecera y navegación— queda quieto y solo el contenido
 * entra, que es como se mueve una herramienta ejecutiva y no una presentación.
 *
 * - `replayOnFocus`: vuelve a correr cada vez que la pantalla recupera el foco,
 *   no solo al montarse. En web el Stack conserva montadas las pantallas a las
 *   que se vuelve, y sin esto «Volver» seguiría siendo un corte seco.
 * - Para cambios de pestaña dentro de una pantalla, se usa con `key` igual a
 *   la pestaña: el remontaje es lo que dispara la entrada.
 * - Quien pidió menos movimiento en el sistema ve el contenido de inmediato.
 */
export function FadeIn({
  children,
  delay = 0,
  duration = 320,
  distance = 8,
  replayOnFocus = false,
  style,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  replayOnFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(prefersReducedMotion() ? 1 : 0)).current;

  const run = useCallback(() => {
    if (prefersReducedMotion()) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      // En web el driver nativo no existe y React Native lo avisa en consola.
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [progress, duration, delay]);

  useEffect(() => {
    if (!replayOnFocus) return run();
  }, [run, replayOnFocus]);

  useFocusEffect(
    useCallback(() => {
      if (replayOnFocus) return run();
    }, [run, replayOnFocus]),
  );

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
