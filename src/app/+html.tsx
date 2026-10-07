import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Envoltorio HTML del build web. Solo corre en el render estático, nunca en el
 * cliente, así que aquí van las cosas que el bundle de React no puede poner.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover para que el fondo llegue bajo el notch del iPhone. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <title>Cartera Zesty</title>

        {/* Archivo en tres pesos: 400 para el cuerpo, 600 para etiquetas y
            controles, 800 para cifras y titulares. Es la tipografía del
            sistema de diseño y la que sostiene el tracking negativo de la
            cifra grande. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&display=swap"
        />

        {/* Instalable en pantalla de inicio, sin barra del navegador. */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Cartera" />
        {/* El color de la barra sigue al tema del sistema. */}
        <meta name="theme-color" content="#efedf2" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#100e16" media="(prefers-color-scheme: dark)" />

        {/* Datos financieros: fuera de los buscadores. */}
        <meta name="robots" content="noindex, nofollow" />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: BASE_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * El fondo se pinta en el `body` además de en la app: sin esto, al hacer scroll
 * con rebote en iOS asoma una franja blanca detrás del contenido.
 */
const BASE_CSS = `
  body { background-color: #efedf2; }
  @media (prefers-color-scheme: dark) {
    body { background-color: #100e16; }
  }
  /* La fuente se declara también aquí para que el primer pintado, antes de que
     React monte, no use la del sistema y salte de tipografía a la vista. */
  body { font-family: Archivo, system-ui, -apple-system, sans-serif; }
  /* El scrub del gráfico es un gesto de arrastre: sin esto el navegador lo
     interpreta como selección de texto y la lectura se llena de resaltados. */
  body { -webkit-user-select: none; user-select: none; }
  input, textarea { -webkit-user-select: text; user-select: text; }
  /* Botones, enlaces y pestañas cambian de color con una transición corta en
     vez de saltar: el hover y el estado activo se sienten fluidos. Solo color,
     fondo y borde; nada que mueva el diseño. */
  [role="button"], [role="button"] *, [role="link"], [role="link"] *, [role="tab"], [role="tab"] * {
    transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    [role="button"], [role="button"] *, [role="link"], [role="link"] *, [role="tab"], [role="tab"] * { transition: none; }
  }
`;
