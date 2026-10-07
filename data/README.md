# data/ — tus datos (fuera de git)

Todo lo que hay en esta carpeta, salvo este archivo, está en `.gitignore`. Nada de
aquí se sube a ningún lado: el tablero corre en tu computador.

```
data/
├── zesty/                  respuestas crudas del MCP (ver docs/SINCRONIZAR.md)
│   ├── positions-cl.json
│   ├── orders-cl.json
│   └── …
├── manual.json             lo que Zesty no sabe (opcional, lo escribes tú o tu agente)
└── precios-corredora.json  historial de precios de Zesty (lo escribe npm run snapshot)
```

## `manual.json`

Todo es opcional. Ejemplo completo en [`ejemplo/manual.json`](../ejemplo/manual.json).

```json
{
  "trades": [
    {
      "symbol": "COPEC",
      "market": "cl",
      "side": "buy",
      "executed_at": "2025-10-06",
      "qty": 40,
      "price": 6680,
      "commission": 0,
      "vat": 0,
      "note": "ESTIMADO: traspaso desde otra corredora"
    }
  ],
  "assets": [
    { "symbol": "MIFONDO", "yahoo_ticker": "MIFONDO.SN", "name": "Mi fondo", "syncs_prices": true }
  ],
  "benchmarkDividends": [
    { "ex_date": "2026-05-07", "amount_per_unit": 17 }
  ]
}
```

### `trades` — operaciones fuera de Zesty

Compras o ventas hechas en otra corredora antes de traspasar los papeles a Zesty.
Sin ellas, una posición traspasada no tiene costo ni fecha y el tablero no puede
dibujar su historia.

| Campo | Obligatorio | Qué es |
|---|---|---|
| `symbol` | sí | el mismo símbolo que usa Zesty (`SQM-B`, `AAPL`) |
| `market` | sí | `cl` (Bolsa de Santiago, en pesos) o `us` (EE.UU., en dólares) |
| `side` | sí | `buy` o `sell` |
| `executed_at` | sí | `YYYY-MM-DD` o ISO 8601 completo |
| `qty` | sí | cantidad de acciones |
| `price` | sí | precio por acción, en la moneda del mercado |
| `commission`, `vat` | no | comisión e IVA que cobró esa corredora (0 si no los sabes) |
| `note` | no | empieza con `ESTIMADO` si la fecha o el precio son aproximados |

### `assets` — correcciones de instrumentos

Cambia el ticker de Yahoo, el nombre, o marca `"syncs_prices": false` para un
instrumento que Yahoo no tiene (se valoriza con el precio de Zesty o a costo).

### `benchmarkDividends` — dividendos del ETF del IPSA

La comparación contra el IPSA usa el ETF `CFMITNIPSA`. Yahoo no publica sus
dividendos; si tuviste ese ETF en Zesty se calculan solos desde tus cobros. Si
no, puedes cargarlos aquí por cuota (`amount_per_unit`, en pesos). Sin ellos, el
índice se compara solo por precio, lo que lo deja un poco por debajo de lo real.
