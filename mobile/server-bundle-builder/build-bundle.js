/**
 * Jalankan tiap kali kamu update editor Tiptap dan mau push
 * versi baru tanpa reinstall APK.
 *
 * Usage:
 *   node build-bundle.js 1.2.0
 *
 * Output:
 *   dist/bundle-1.2.0.zip   <- upload ini ke API_BUNDLE_URL_TEMPLATE
 *   dist/version.json       <- upload/overwrite ini ke API_VERSION_URL
 *
 * Install dulu: npm install archiver
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const archiver = require('archiver');

const version = process.argv[2];
if (!version) {
  console.error('Usage: node build-bundle.js <version>  contoh: node build-bundle.js 1.2.0');
  process.exit(1);
}

const SRC_DIR = path.join(__dirname, 'editor-src');
const DIST_DIR = path.join(__dirname, 'dist');
const zipPath = path.join(DIST_DIR, `bundle-${version}.zip`);
const versionJsonPath = path.join(DIST_DIR, 'version.json');
const configJsonPath = path.join(DIST_DIR, 'config.json');

if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const checksum = sha256File(zipPath);
  const sizeKb = (archive.pointer() / 1024).toFixed(1);

  const versionInfo = {
    version,
    checksum,
    releasedAt: new Date().toISOString(),
    sizeKb: Number(sizeKb)
  };

  fs.writeFileSync(versionJsonPath, JSON.stringify(versionInfo, null, 2));

  // config.json = relative endpoints (bootstrap.js resolves them against
  // the same GitHub Release where this file is hosted).
  fs.writeFileSync(configJsonPath, JSON.stringify({
    versionUrl: 'version.json',
    bundleUrlTemplate: 'bundle-{version}.zip'
  }, null, 2));

  console.log(`✔ bundle-${version}.zip dibuat (${sizeKb} KB)`);
  console.log(`✔ version.json diperbarui:`);
  console.log(JSON.stringify(versionInfo, null, 2));
  console.log(`\nLangkah selanjutnya:`);
  console.log(`  1. Upload ${zipPath}, ${versionJsonPath}, dan ${configJsonPath} ke release terbaru`);
  console.log(`     (bootstrap.js pakai path "latest/download" dari REMOTE_CONFIG_URL di config.js)`);
  console.log(`  3. User yang buka app akan otomatis download versi ini saat online`);
});

archive.on('error', (err) => { throw err; });
archive.pipe(output);
archive.directory(SRC_DIR + '/', false);
archive.finalize();

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
