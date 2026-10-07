---
name: sincronizar-zesty
description: Instala el tablero o sincroniza la cartera de Zesty del usuario usando el MCP de Zesty (solo lectura) y la deja visible en el tablero local. Usar cuando el usuario pida instalar el dashboard, actualizar, sincronizar o ver su cartera de Zesty, o después de que compre, venda, deposite o cambie dólares.
---

# Sincronizar la cartera de Zesty

1. Lee `AGENTS.md` (reglas e instalación) y `docs/SINCRONIZAR.md` (procedimiento).
2. Si el tablero no está instalado (`node_modules/` no existe o el MCP de Zesty no
   está conectado), sigue «Instalar» de `AGENTS.md`.
3. Sigue `docs/SINCRONIZAR.md` al pie de la letra: guardar las respuestas `get_*`
   crudas en `data/zesty/`, `npm run snapshot`, resolver los `AVISO:`.
4. Si el tablero no está corriendo, `npm run dashboard` en segundo plano y entrega
   http://localhost:8081.

Nunca llames herramientas de Zesty que no sean `get_*`.
