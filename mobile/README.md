# Cordova + Tiptap Hot-Update Scaffold

## Yang harus kamu isi sendiri

1. **`server-bundle-builder/editor-src/index.html`**
   Ganti dengan Tiptap editor kamu yang sekarang (single-HTML bundled).
   Tempel juga snippet dari `SHARE_INTENT_SNIPPET.js` supaya fitur terima-share jalan.

2. **`www/editor-fallback.html`**
   Ganti isinya dengan Tiptap versi SEKARANG juga (sama seperti di atas) —
   ini fallback kalau device belum pernah online.

3. **Endpoint hosting di `www/js/config.js`** (baris paling atas):
   ```js
   var REMOTE_CONFIG_URL = 'https://github.com/jtw/notes-editor/releases/latest/download/config.json';
   ```
   Host di file ini (atau server kamu sendiri) file `config.json` berisi:
   ```json
   { "versionUrl": "editor/version.json", "bundleUrlTemplate": "editor/bundle-{version}.zip", "pushRegisterUrl": "push/register-token" }
   ```
   Alamat endpoint diperbolehkan absolut (`https://...`) atau relatif terhadap
   direktori `config.json`. Ganti server tanpa rebuild APK = cukup edit config.json.

4. **Push token (opsional)** — `pushRegisterUrl` di config.json di atas adalah
   endpoint server untuk menerima FCM token per device. Tanpa `cordova-plugin-firebasex`
   (sudah dihapus dari config.xml), push hanya jadi placeholder — local notification
   (update/share) tetap jalan tanpa Firebase.

## Setup Firebase (opsional, untuk push notification saja)

Push sudah tidak dipakai untuk kontrak hot-update ini — config.xml tidak
menyertakan `cordova-plugin-firebasex`, karena tanpa `google-services.json`
plugin itu justru menggagalkan build. Kalau suatu saat mau push broadcast:

1. Buat project di [Firebase Console](https://console.firebase.google.com).
2. Add Android app, package name harus **sama persis** dengan `id` di `config.xml` (`com.jtw.notes`).
3. Download `google-services.json`, taruh di **root project** (sejajar `config.xml`), lalu:
   ```bash
   cordova plugin add cordova-plugin-firebasex
   ```
4. Untuk broadcast dari server: Project Settings > Service Accounts > Generate new
   private key, simpan sebagai `service-account.json` di `server-bundle-builder/`
   (JANGAN commit ke git publik).

Kalau setup Firebase dilakukan, hapus komentar TODO di `notifications.js` agar
`initPush()` aktif kembali.

## Alur kerja rilis update editor (tanpa reinstall APK)

```
1. npm run build:offline   (hasil: dist/index.html)
2. node scripts/stage-mobile.mjs   (dist/index.html -> editor-src & fallback)
3. cd server-bundle-builder && npm install archiver
4. node build-bundle.js 1.2.0
5. Upload config.json, bundle-1.2.0.zip, version.json -> rilis terbaru
   (bootstrap.js pakai "latest/download" dari REMOTE_CONFIG_URL)
6. User buka app -> bootstrap.js otomatis detect versi baru -> download -> pakai
```

Untuk rilis penuh (APK + bundle + config) lewat GitHub Actions, pakai
`.github/workflows/android.yml` — build APK debug, attach ke GitHub Release
beserta asset `config.json`, `bundle-<version>.zip`, `version.json`.

## Build APK

Semua langkah ada di `colab/build_apk_colab.py` — copy tiap blok
`# --- CELL n ---` jadi cell terpisah di Google Colab notebook baru.
Upload dulu folder scaffold ini ke Google Drive kamu sebelum mulai.

## Testing lokal sebelum build APK

```bash
cordova platform add android
cordova run android --device
```

Cek log dengan:
```bash
adb logcat | grep -i bootstrap
```

## Kalau share-intent belum muncul di share sheet Android

- Uninstall dulu APK lama, install ulang (Android cache daftar app share sheet).
- Pastikan `AndroidManifest.xml` hasil generate benar2 dapat intent-filter
  (cek: `platforms/android/app/src/main/AndroidManifest.xml` setelah `cordova prepare`).
