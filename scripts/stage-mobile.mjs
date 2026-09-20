/**
 * Jalankan SETELAH `npm run build:offline` — nyalin dist/index.html (single-file)
 * ke lokasi yang dibutuhkan scaffold Cordova:
 *   1. mobile/server-bundle-builder/editor-src/index.html  -> di-zip jadi bundle-update
 *   2. mobile/www/editor-fallback.html                     -> fallback builtin (kalau belum pernah online)
 *
 * Usage: node scripts/stage-mobile.mjs
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = `${root}dist/index.html`;
const targets = [
  'mobile/server-bundle-builder/editor-src/index.html',
  'mobile/www/editor-fallback.html',
];

if (!existsSync(dist)) {
  console.error('dist/index.html tidak ada. Jalankan dulu: npm run build:offline');
  process.exit(1);
}

const html = readFileSync(dist, 'utf8');

// Sanity: single-file bundle harus punya inline module script + tidak boleh
// bergantung ke file eksternal (public.js diharapkan tidak ada di build offline).
if (!/<script type="module"[^>]*>/.test(html)) {
  console.error('dist/index.html bukan single-file inline module. Cek vite-plugin-singlefile.');
  process.exit(1);
}

for (const target of targets) {
  writeFileSync(`${root}${target}`, html);
  console.log(`✓ ${target} (${(html.length / 1024).toFixed(1)} KB)`);
}
console.log('Selesai. Jalankan verify-mobile.mjs untuk cek pre-flight.');