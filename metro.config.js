// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Tus datos, el demo y los scripts de Node nunca entran al bundle de la app: la
// app solo lee `public/data/snapshot.json` por HTTP. Excluirlos además evita que
// Metro vigile archivos que se reescriben a cada rato.
const escape = (dir) => dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = ['data', 'ejemplo', 'scripts'].map(
  (dir) => new RegExp('^' + escape(path.join(__dirname, dir)) + '[\\\\/]'),
);

module.exports = config;
