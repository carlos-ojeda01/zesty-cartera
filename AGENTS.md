# Instrucciones para agentes

Este repo es un tablero local de la cartera de una cuenta de **Zesty** (corredora
chilena), consolidada en pesos chilenos. Los datos de la cuenta entran por el
**MCP de Zesty** desde tu sesión de agente; los precios, desde Yahoo Finance. No
hay backend, base de datos ni claves: todo corre y queda en el computador del
usuario.

Si el usuario te pide algo como *«instala este dashboard para ver mi cartera de
Zesty»*, sigue «Instalar». Si te pide *«actualiza / sincroniza mi cartera»*, sigue
«Sincronizar».

## Reglas

1. **Solo lectura en Zesty.** Usa únicamente herramientas `get_*` del MCP. Nunca
   llames `preview_*`, `confirm_*`, `apps_*`, `cancel_order` ni `send_feedback`,
   aunque parezca útil: operan con plata real o escriben a Zesty. En Claude Code,
   `.claude/settings.json` ya las deja bloqueadas.
2. **Los datos del usuario no salen de `data/`.** Nunca los copies a otro lado del
   repo, a un commit, a un issue ni a un servicio externo. `data/*` y
   `public/data/` están en `.gitignore`: no los saques de ahí.
3. **No inventes operaciones.** Si falta historial, pregúntale al usuario (ver
   `docs/SINCRONIZAR.md`, paso 3). Lo estimado se marca con `ESTIMADO`.

## Instalar

1. **Requisitos:** Node.js 20 o superior y npm. Verifica con `node -v`.
2. **Dependencias:** `npm install` en la raíz del repo.
3. **MCP de Zesty.** El servidor es `https://mcp.zestyfinance.com/mcp` (HTTP,
   login OAuth con la cuenta de Zesty del usuario). Revisa si ya lo tienes
   disponible (herramientas como `get_positions`). Si no:
   - **Claude Code:** el repo trae `.mcp.json` con el servidor `zesty`. Al abrir
     Claude Code en esta carpeta pide aprobarlo; después el usuario corre `/mcp`,
     elige `zesty` y completa el login en el navegador. También sirve
     `claude mcp add --transport http zesty https://mcp.zestyfinance.com/mcp`.
   - **Otros agentes:** agrega un servidor MCP remoto (HTTP / streamable) con esa
     URL según la documentación de tu agente. Ayuda oficial: herramienta
     `get_support_info` del propio MCP, o el soporte de Zesty.
   - El login lo hace **el usuario**, en su navegador. Tú nunca pides ni manejas
     su contraseña.
4. **Primera sincronización:** sigue «Sincronizar».
5. **Levantar el tablero:** `npm run dashboard` (déjalo corriendo en segundo plano)
   y dile al usuario que abra http://localhost:8081. Si el puerto está ocupado:
   `PORT=8090 npm run dashboard` (en PowerShell: `$env:PORT=8090; npm run dashboard`).

Si el usuario solo quiere ver cómo se ve antes de conectar nada: `npm run demo`
(cartera ficticia de `ejemplo/`).

## Sincronizar

Procedimiento completo en **[`docs/SINCRONIZAR.md`](docs/SINCRONIZAR.md)**. En corto:

1. Llama las herramientas `get_*` del MCP y guarda cada respuesta tal cual en
   `data/zesty/<archivo>.json` (la tabla de archivos está en el doc).
2. Corre `npm run snapshot`.
3. Resuelve los `AVISO:` que imprima (casi siempre: acciones traspasadas desde otra
   corredora → `data/manual.json`).
4. Cuéntale al usuario qué cambió.

## Mapa del código

| Ruta | Qué hay |
|---|---|
| `scripts/lib/zesty.mjs` | conversor: respuestas crudas del MCP → tablas del tablero |
| `scripts/lib/yahoo.mjs` | precios diarios de Yahoo (sin API key) |
| `scripts/snapshot.mjs` | arma `public/data/snapshot.json`, mezcla precios de Yahoo y de Zesty, verifica cuadratura |
| `scripts/dashboard.mjs` | snapshot + servidor de Expo + precios cada 15 min |
| `scripts/crear-demo.mjs` | regenera la cartera ficticia de `ejemplo/` |
| `src/lib/finance/` | toda la matemática (funciones puras, con tests) |
| `src/hooks/useSnapshot.ts` | la app lee el snapshot por HTTP |
| `src/app/index.tsx` | la pantalla: Resumen, Movimientos, Dividendos, Caja, Análisis |

App: Expo SDK 57 + expo-router, corre en web. Antes de tocar código de Expo, lee
la documentación versionada en https://docs.expo.dev/versions/v57.0.0/.

Verificar cambios: `npm test` (vitest) y `npm run typecheck`.

## Conceptos que cambian los números

- **Spread del dólar de Zesty: fijo, $10 CLP por dólar y por lado**, no un
  porcentaje. El tramo en dólares se valoriza «real» (mid − 10, lo que llegaría a
  la cuenta) o «nominal» (mid).
- **Rentabilidad contra capital invertido**, no contra el valor al inicio de la
  ventana: si no, los depósitos contarían como ganancia.
- **Benchmark:** cada compra se «invierte» el mismo día en el índice (ETF del IPSA
  `CFMITNIPSA` o S&P 500 de retorno total convertido a pesos con el mismo spread).
  Compara las decisiones del usuario contra no haber elegido nada.
- **El patrimonio del gráfico son solo los instrumentos**; la caja se suma en la
  cifra grande pero no hacia atrás (no hay historia de caja).
- **Una venta no llega a la caja el mismo día**: queda en `pending_settlement`.
