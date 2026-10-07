import { AccessibilityInfo } from 'react-native';

/**
 * Preferencia de movimiento reducido, resuelta una vez por sesión.
 *
 * Consultarla dentro de un efecto ponía una promesa en el camino crítico de
 * cada animación: la animación quedaba esperando a que resolviera y, cuando el
 * efecto se volvía a correr antes de eso, la corrida quedaba cancelada y el
 * gráfico se quedaba en cero —dibujado a medias o invisible—. Nadie cambia esta
 * preferencia a mitad de un gesto, así que se lee al cargar y se guarda.
 */
let reduceMotion = false;
Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.() ?? false)
  .then((v) => {
    reduceMotion = v === true;
  })
  .catch(() => {
    // Si la plataforma no expone la preferencia, se anima.
  });

/**
 * En el navegador la preferencia se puede leer sin esperar, así que la primera
 * animación ya la respeta aunque la consulta asíncrona todavía no haya vuelto.
 * En nativo no hay equivalente sincrónico y se usa el valor ya resuelto.
 */
export function prefersReducedMotion(): boolean {
  const mm = (globalThis as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
  if (typeof mm === 'function') {
    try {
      return mm('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return reduceMotion;
    }
  }
  return reduceMotion;
}
