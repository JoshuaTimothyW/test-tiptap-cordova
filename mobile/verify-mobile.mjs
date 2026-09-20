/**
 * Pre-flight check untuk build APK Cordova. Jalankan SEBELUM nge-build biar
 * error (ikon hilang, XML invalid, plugin firebasex tanpa google-services.json,
 * placeholder bertebaran) ketangkap lebih dulu, bukan di tengah gradle.
 *
 * Usage: node mobile/verify-mobile.mjs
 * Exit code 0 = aman di-build, non-0 = ada masalah (lihat pesannya).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const errors = [];
const check = (ok, msg) => { if (!ok) errors.push(msg) };

// --- 1. config.xml valid & properti inti benar ---
const configXml = `${root}mobile/config.xml`;
check(existsSync(configXml), 'config.xml tidak ada');
const xml = existsSync(configXml) ? readFileSync(configXml, 'utf8') : '';
const id = /<widget[^>]*\bid="([^"]+)"/.exec(xml)?.[1] || '';
const name = /<name>([^<]+)<\/name>/.exec(xml)?.[1] || '';
check(id === 'com.jtw.notes', `id harus com.jtw.notes, sekarang "${id}"`);
check(name === 'Notes', `name harus "Notes", sekarang "${name}"`);
check(!/<plugin[^>]*firebasex/i.test(xml), 'config.xml masih menyebut cordova-plugin-firebasex (build gagal tanpa google-services.json)');
check(/<access origin="\*"\s*\/>/.test(xml), 'access origin="*" hilang');

// --- 2. Ikon ada & dimensinya benar (cek IHDR, bukan ukuran file —
// PNG warna datar sangat terkompresi, 36px bisa cuma ~200 byte) ---
const pngSize = (buf) => ({
  w: buf.readUInt32BE(16),
  h: buf.readUInt32BE(20),
});
const EXPECTED = { ldpi: 36, mdpi: 48, hdpi: 72, xhdpi: 96 };
for (const density of ['ldpi', 'mdpi', 'hdpi', 'xhdpi']) {
  const p = `${root}mobile/res/icon/android/${density}.png`;
  check(existsSync(p), `ikon ${density}.png tidak ada`);
  if (existsSync(p)) {
    const buf = readFileSync(p);
    check(buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47, `${density}.png bukan PNG valid`);
    const { w, h } = pngSize(buf);
    check(w === EXPECTED[density] && h === EXPECTED[density], `${density}.png harus ${EXPECTED[density]}x${EXPECTED[density]}, sekarang ${w}x${h}`);
  }
}

// --- 3. Referensi ikon di config.xml cocok dengan file yang ada ---
const iconRefs = [...xml.matchAll(/<icon[^>]*src="([^"]+)"/g)].map(m => m[1]);
for (const ref of iconRefs) {
  check(existsSync(`${root}mobile/${ref}`), `ikon yang direferensikan tidak ada: ${ref}`);
}

// --- 4. Rantai boot www aman (index.html → config.js → notify/bootstrap) ---
// cordova.js DIINJECT oleh Cordova CLI saat `cordova prepare` — tidak pernah
// ada di scaffold, jadi cuma dicek referensinya, bukan keberadaan file-nya.
const wwwIndex = `${root}mobile/www/index.html`;
const indexHtml = existsSync(wwwIndex) ? readFileSync(wwwIndex, 'utf8') : '';
for (const js of ['cordova.js', 'js/config.js', 'js/notifications.js', 'js/bootstrap.js', 'js/jszip.min.js']) {
  check(indexHtml.includes(js), `www/index.html tidak me-load ${js}`);
}
for (const js of ['js/config.js', 'js/notifications.js', 'js/bootstrap.js', 'js/jszip.min.js']) {
  check(existsSync(`${root}mobile/www/${js}`), `www/${js} tidak ada`);
}
check(/<script src="js\/config\.js"/.test(indexHtml), 'config.js harus dimuat SEBELUM bootstrap.js');

// --- 5. Tidak boleh ada placeholder api.kamu.com di kode www/js ---
const jsFiles = ['config.js', 'notifications.js', 'bootstrap.js'];
for (const f of jsFiles) {
  const content = readFileSync(`${root}mobile/www/js/${f}`, 'utf8');
  check(!/api\.kamu\.com/.test(content), `www/js/${f} masih ada placeholder api.kamu.com`);
}
const configJs = readFileSync(`${root}mobile/www/js/config.js`, 'utf8');
check(/REMOTE_CONFIG_URL\s*=\s*'https:\/\//.test(configJs), 'config.js REMOTE_CONFIG_URL belum https');

// --- 6. Editor bundle sudah di-stage & bukan placeholder ---
for (const target of ['server-bundle-builder/editor-src/index.html', 'www/editor-fallback.html']) {
  const p = `${root}mobile/${target}`;
  check(existsSync(p), `${target} tidak ada — jalankan node scripts/stage-mobile.mjs`);
  if (existsSync(p)) {
    const size = statSync(p).size;
    check(size > 200 * 1024, `${target} kebanyakan placeholder (${(size / 1024).toFixed(0)} KB) — jalankan stage-mobile.mjs`);
    const content = readFileSync(p, 'utf8');
    check(content.includes('id="editor"') && /<script type="module"/.test(content), `${target} bukan bundle editor yang dikenali`);
    check(!/Taruh Tiptap editor kamu di sini/.test(content), `${target} masih placeholder`);
  }
}

// --- 7. Sisa file scaffold kritis ada ---
check(existsSync(`${root}mobile/server-bundle-builder/build-bundle.js`), 'build-bundle.js tidak ada');
check(existsSync(`${root}mobile/colab/build_apk_colab.py`), 'build_apk_colab.py tidak ada');

// --- 8. config.xml tidak boleh menyebut allow-navigation api.kamu.com ---
check(!/api\.kamu\.com/.test(xml), 'config.xml masih ada allow-navigation api.kamu.com');

if (errors.length) {
  console.error('✗ VERIFY GAGAL — perbaiki dulu sebelum build:');
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log('✓ VERIFY PASS — semua pre-flight check lolos.');
console.log(`  (config id=${id}, name=${name})`);