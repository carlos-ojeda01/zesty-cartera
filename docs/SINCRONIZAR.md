# Sincronizar la cartera desde el MCP de Zesty

Procedimiento para un agente (Claude Code, Codex, Cursor, Gemini CLI…) con el MCP
de Zesty conectado. Se corre cada vez que el usuario quiera ver su cartera al día:
después de comprar, vender, depositar o cambiar dólares.

**Regla número uno: solo lectura.** Este procedimiento usa únicamente herramientas
`get_*` del MCP. Nunca llames `preview_*`, `confirm_*`, `apps_*` ni `cancel_order`:
operan con plata real. `.claude/settings.json` ya las bloquea en Claude Code.

## 1. Bajar las respuestas a `data/zesty/`

Llama cada herramienta y guarda la respuesta **tal cual la devuelve el MCP**, como
JSON, en el archivo indicado. No la resumas, no la reformatees, no le cambies
nombres de campos: la conversión la hace `scripts/lib/zesty.mjs`, no el agente.

| Herramienta del MCP | Argumentos | Archivo |
|---|---|---|
| `get_positions` | `market: "cl"` | `data/zesty/positions-cl.json` |
| `get_positions` | `market: "us"` | `data/zesty/positions-us.json` |
| `get_balance` | `market: "cl"` | `data/zesty/balance-cl.json` |
| `get_balance` | `market: "us"` | `data/zesty/balance-us.json` |
| `get_orders` | `market: "cl", status: "all"` | `data/zesty/orders-cl.json` |
| `get_orders` | `market: "cl", status: "pending"` | `data/zesty/orders-cl-pending.json` |
| `get_orders` | `market: "us", status: "all"` | `data/zesty/orders-us.json` |
| `get_orders` | `market: "us", status: "pending"` | `data/zesty/orders-us-pending.json` |
| `get_dividends` | `market: "cl"` | `data/zesty/dividends-cl.json` |
| `get_dividends` | `market: "us"` | `data/zesty/dividends-us.json` |
| `get_movements` | (sin argumentos) | `data/zesty/movements.json` |
| `get_fx_history` | (sin argumentos) | `data/zesty/fx-history.json` |
| `get_pending_fx` | (sin argumentos) | `data/zesty/pending-fx.json` |

Detalles que importan:

- **Paginación.** Si una respuesta trae `nextToken` distinto de `null`, vuelve a
  llamar con ese `nextToken` y guarda cada página con sufijo: `orders-cl-2.json`,
  `orders-cl-3.json`… El conversor lee todos los archivos que empiezan con el
  mismo prefijo y descarta repetidos.
- **`get_movements`** con el tipo por defecto (`all`) no pagina. Si alguna lista
  viene con `nextToken`, pide el resto con `type: "deposits"` o
  `type: "withdrawals"` y guárdalo como `movements-deposits-2.json` /
  `movements-withdrawals-2.json`.
- **`status: "all"` solo trae órdenes cerradas.** Por eso se piden también las
  `pending`: una orden parcialmente ejecutada ya movió acciones.
- **Datos personales.** Las respuestas traen RUT, ids de usuario y hashes. Quedan
  solo en tu computador (`data/` está en `.gitignore`) y el conversor no los copia
  al tablero. Si prefieres, puedes borrar esos campos al guardar.
- Escribe además `data/zesty/sync.json` con la hora actual:
  `{"synced_at": "2026-10-07T18:30:00Z"}` (ISO 8601, UTC). Si no sabes la hora
  exacta, sáltate este archivo: se usa la fecha de los archivos guardados.

## 2. Armar el tablero

```bash
npm run snapshot
```

Lee `data/zesty/`, suma `data/manual.json`, trae precios de Yahoo Finance y
escribe `public/data/snapshot.json`. Imprime un resumen y, si algo no cuadra,
líneas que empiezan con `AVISO:`.

## 3. Resolver los avisos

### «Zesty reporta N y las operaciones suman M»

Las posiciones del tablero se reconstruyen desde las operaciones, no desde la foto
de Zesty, porque así se puede dibujar la historia. Si no cuadran, falta historial.
El caso típico: **acciones traspasadas desde otra corredora**, que Zesty muestra en
`get_positions` pero no tiene en `get_orders`.

Arréglalo en `data/manual.json` (créalo si no existe; formato en
[`data/README.md`](../data/README.md)):

1. **Pregúntale al usuario** la fecha y el precio de la compra original. Si los
   tiene (cartola de la corredora anterior, pantallazos), úsalos.
2. Si no los tiene, carga una compra estimada con la cantidad faltante, el
   `avgPrice` que muestra Zesty en `positions-cl.json` (o `avgBuyPrice` en EE.UU.)
   y la fecha que el usuario recuerde. Márcala con
   `"note": "ESTIMADO: traspaso desde otra corredora"`. El tablero la lista en
   Análisis → «Datos por confirmar».
3. Vuelve a correr `npm run snapshot` hasta que no queden avisos de este tipo.

### «Yahoo no tiene TICKER»

Algunos instrumentos (fondos, ETF chilenos nuevos) no existen en Yahoo. El papel se
valoriza con el precio que reporta Zesty en cada sincronización, y a costo los días
anteriores. Si conoces el ticker correcto en Yahoo, corrígelo en `manual.json`:

```json
{ "assets": [{ "symbol": "MIFONDO", "yahoo_ticker": "MIFONDO-CL.SN" }] }
```

## 4. Mostrarlo

Si el tablero no está corriendo, `npm run dashboard` y abre http://localhost:8081.
Si ya está abierto, basta con el botón ↻.

Cuéntale al usuario qué cambió desde la sincronización anterior (operaciones
nuevas, posiciones que salieron, dividendos cobrados) y si quedó algún aviso.

## Por qué así

- **El navegador no puede hablar con Zesty.** No hay API pública ni token
  reutilizable: el único acceso es el MCP, con el login OAuth de tu agente. Por eso
  la cartera se actualiza cuando se lo pides al agente, y los precios sí se
  actualizan solos.
- **Guardar crudo y convertir con código** hace que la conversión sea idéntica cada
  vez y revisable (`scripts/lib/zesty.mjs` tiene tests), en vez de depender de que
  el agente interprete bien cada campo.
- **Los precios de Zesty se guardan día a día** en `data/precios-corredora.json`.
  Yahoo deja de publicar sesiones de papeles chilenos poco líquidos por semanas;
  Zesty sabe el precio de cada día. Ese historial no se puede reconstruir después,
  por eso conviene sincronizar seguido.
