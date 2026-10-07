#!/usr/bin/env node
/**
 * Levanta el tablero en local: arma el snapshot, abre el servidor de Expo y
 * vuelve a traer precios cada 15 minutos mientras esté corriendo. El botón ↻
 * del tablero relee el archivo, así que con eso basta para ver precios del día.
 *
 *   npm run dashboard          # tu cartera
 *   npm run demo               # la cartera ficticia de ejemplo/
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const puerto = process.env.PORT ?? '8081';
const CADA_MS = 15 * 60 * 1000;

const snapshot = () =>
  new Promise((ok) => {
    const p = spawn(process.execPath, [join(raiz, 'scripts', 'snapshot.mjs'), ...args], { cwd: raiz, stdio: 'inherit' });
    p.on('exit', ok);
  });

await snapshot();

const expo = spawn('npx', ['expo', 'start', '--web', '--port', puerto], {
  cwd: raiz,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
console.log(`\nTablero en http://localhost:${puerto}  (precios cada 15 min; Ctrl+C para salir)\n`);

const timer = setInterval(snapshot, CADA_MS);
expo.on('exit', (code) => {
  clearInterval(timer);
  process.exit(code ?? 0);
});
