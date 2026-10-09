// ============================================================
// KONFIGURASI - endpoint dibaca dari REMOTE CONFIG (config.js)
// ============================================================
var EDITOR_DIR_NAME = 'editor-current';
var FALLBACK_PAGE = 'editor-fallback.html'; // bundled, dipakai kalau belum pernah online
var STAGING_DIR_NAME = 'editor-staging'; // extract sementara, lalu di-swap kalau utuh

// Diagnostics TIDAK pernah ditampilkan di atas editor -- cukup di Settings
// (baris "Update error"). Banner di halaman cuma ganggu.
function setStatus(msg, isError) {
  if (!msg) return;
  console.log('[bootstrap]', isError ? 'ERROR: ' + msg : msg);
  // Kesimpen supaya kegagalannya masih bisa dibaca dari Settings walau app
  // sempat reload/ditutup. Hapus hanya kalau update berikutnya sukses.
  if (!isError) return;
  try { localStorage.setItem('editor_update_error', String(msg)); } catch (e) {}
}

document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  setStatus('');
  Notify.initPush();
  captureShareIntent(function () {
    // Startup TANPA jaringan: langsung inject bundle yang ada. Update
    // di-check manual lewat Settings (window.__updateCheck).
    showEditorNow();
  });
}

// ------------------------------------------------------------
// 1. Tangkap konten yang di-share dari app lain (share sheet)
// ------------------------------------------------------------
function captureShareIntent(done) {
  if (!window.plugins || !window.plugins.webintent) return done();
  var wi = window.plugins.webintent;

  readShareText(wi, function (text) {
    handleIncomingShare(text);
    done();
  });

  // kalau app sudah running di background dan menerima share baru
  wi.onNewIntent(function () {
    readShareText(wi, function (text) {
      handleIncomingShare(text);
    });
  });
}

// ACTION_SEND text/plain menaruh isi share di EXTRA_TEXT, bukan data URI
// (getUri = intent.getDataString(), untuk share teks biasanya null).
// Jadi baca EXTRA_TEXT dulu, baru fallback ke URI.
function readShareText(wi, cb) {
  var fallbackUri = function () {
    wi.getUri(function (uri) { cb(uri); }, function () { cb(null); });
  };
  wi.hasExtra(wi.EXTRA_TEXT, function (has) {
    if (!has) return fallbackUri();
    wi.getExtra(wi.EXTRA_TEXT, function (text) { cb(text); }, fallbackUri);
  }, fallbackUri);
}

function handleIncomingShare(uri) {
  if (!uri) return;
  try {
    // simpan ke localStorage supaya bisa dibaca oleh halaman editor
    // (file:// origin di Android WebView konsisten antar path, jadi localStorage nyambung)
    var pending = {
      content: uri,
      receivedAt: Date.now()
    };
    localStorage.setItem('pending_share', JSON.stringify(pending));
    Notify.shareReceived(uri);
  } catch (e) {
    console.warn('gagal simpan share intent', e);
  }
}

// ------------------------------------------------------------
// 2. Startup: TANPA jaringan. Langsung inject bundle terakhir yang
// sudah ada (editor-current/), atau fallback bawaan APK kalau belum
// pernah update. Cek update hanya manual dari Settings.
// ------------------------------------------------------------
var configState = { versionUrl: '', bundleUrlTemplate: '' };

function showEditorNow() {
  var targetDirPath = cordova.file.dataDirectory + EDITOR_DIR_NAME + '/';
  resolveEntry(targetDirPath)
    .then(redirectTo)
    .catch(function (err) {
      var why = (err && err.message) ? err.message : String(err);
      setStatus('Editor failed to load: ' + why, true);
      redirectTo(FALLBACK_PAGE);
    });
}

// ------------------------------------------------------------
// 3. UPDATE MANUAL (Settings > Check for updates)
// Editor dan bootstrap satu window/halaman (bundle di-inject ke
// halaman boot), jadi editor cukup memanggil window.__updateCheck().
// Download+ekstrak jalan sendiri; bundle baru dipakai saat halaman
// di-reload. Berlindung dari double-tap (running/promise).
// ------------------------------------------------------------
var updateCheckState = { running: false, promise: null };

window.__updateCheck = function () {
  if (updateCheckState.running) return updateCheckState.promise;
  var localVersion = localStorage.getItem('editor_version') || '0';
  var targetDirPath = cordova.file.dataDirectory + EDITOR_DIR_NAME + '/';

  updateCheckState.running = true;
  updateCheckState.promise = AppConfig.get()
    .then(function (cfg) {
      configState = AppConfig.endpoints(cfg);
      Notify.setPushConfig(cfg);
      return doUpdate(localVersion, targetDirPath);
    })
    .then(function (res) {
      updateCheckState.running = false;
      return res;
    })
    .catch(function (err) {
      updateCheckState.running = false;
      var why = (err && err.message) ? err.message : String(err);
      setStatus('Update failed: ' + why, true);
      return { status: 'error', message: why };
    });
  return updateCheckState.promise;
};

function doUpdate(localVersion, targetDirPath) {
  return fetchVersionInfo(configState.versionUrl)
    .then(function (remote) {
      if (!remote || remote.version == null) throw new Error('remote info tidak valid');
      if (remote.version === localVersion) return { status: 'up-to-date', version: localVersion };
      setStatus('Update available (v' + remote.version + '), downloading...');
      return downloadAndExtractBundle(remote, targetDirPath)
        .then(function () {
          // Update sukses -> error lama (kalau ada) sudah tidak relevan.
          localStorage.setItem('editor_version', remote.version);
          localStorage.removeItem('editor_update_error');
          Notify.updateInstalled(remote.version);
          setStatus('');
          return { status: 'updated', version: remote.version };
        });
    });
}

// Pakai nativeFetchText (FileTransfer), bukan fetch(): halaman ini ber-origin
// file:// dan GitHub tidak mengirim access-control-allow-origin, jadi fetch()
// selalu kena blok CORS. Lihat catatan di config.js.
function fetchVersionInfo(versionUrl) {
  return new Promise(function (resolve, reject) {
    nativeFetchText(versionUrl, function (text) {
      try { resolve(JSON.parse(text)); } // { version: "1.2.0", checksum: "..." }
      catch (e) { reject(new Error('version JSON rusak: ' + e.message)); }
    }, reject);
  });
}

// kalau versi sudah sama / offline: pakai extract folder yg ada, atau fallback
function resolveEntry(targetDirPath) {
  return fileExists(targetDirPath + 'index.html').then(function (exists) {
    if (exists) return targetDirPath + 'index.html';
    return FALLBACK_PAGE;
  });
}

// ------------------------------------------------------------
// PENTING: TIDAK pakai window.location.href lagi.
// Kenapa: itu navigasi penuh ke origin file:// terpisah, yang bikin
// IndexedDB (dan storage lain) terpisah dari origin app utama, dan
// di sebagian Android WebView, IndexedDB malah di-block total di
// origin file://.
//
// Solusi: baca HTML hasil extract sebagai teks, lalu suntik ke DOM
// halaman INI (origin gak pernah berubah -> IndexedDB tetap nyambung
// terus antar update).
// ------------------------------------------------------------
function redirectTo(entryPath) {
  return loadBundleIntoCurrentPage(entryPath);
}

function loadBundleIntoCurrentPage(entryPath) {
  return readTextFile(entryPath).then(function (htmlText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlText, 'text/html');

    // 0. Buang CSS loading screen milik halaman ini — kalau dibiarkan,
    //    `display:flex; align-items:center` dari #boot-styles tetap menimpa
    //    bundle (editor tampil sempit di tengah, latar gelap #111).
    var bootStyle = document.getElementById('boot-styles');
    if (bootStyle && bootStyle.parentNode) {
      bootStyle.parentNode.removeChild(bootStyle);
    }

    // 1. pindahkan <link>/<style> dari head bundle ke head halaman ini
    var headNodes = doc.head ? Array.prototype.slice.call(doc.head.childNodes) : [];
    headNodes.forEach(function (node) {
      if (node.tagName === 'LINK' || node.tagName === 'STYLE') {
        document.head.appendChild(document.importNode(node, true));
      }
    });

    // 2. ganti body halaman ini dengan body bundle.
    var newBody = document.importNode(doc.body, true);

    // 2a. Kumpulkan SEMUA script (head DAN body, urutan dokumen) lalu buang.
    //     PENTING: module script utama editor Vite ada di <head> bundle;
    //     kalau hanya ambil script body, module itu tidak pernah jalan
    //     -> DOM tersuntik tapi editor blank.
    var scripts = [];
    var headScripts = doc.head ? Array.prototype.slice.call(doc.head.querySelectorAll('script')) : [];
    var bodyScripts = Array.prototype.slice.call(newBody.querySelectorAll('script'));
    headScripts.forEach(function (s) { if (s.parentNode) s.parentNode.removeChild(s); });
    bodyScripts.forEach(function (s) { if (s.parentNode) s.parentNode.removeChild(s); });
    scripts = headScripts.concat(bodyScripts);

    document.body.innerHTML = '';
    while (newBody.firstChild) {
      document.body.appendChild(newBody.firstChild);
    }

    // 3. jalankan ulang tiap <script> secara manual (head dulu, baru body).
    //    Script module dieksekusi async -> body sudah terisi saat ia jalan.
    scripts.forEach(function (oldScript) {
      var newScript = document.createElement('script');
      Array.prototype.forEach.call(oldScript.attributes, function (attr) {
        newScript.setAttribute(attr.name, attr.value);
      });
      newScript.text = oldScript.textContent;
      document.body.appendChild(newScript);
    });

    // 4. PENTING: kalau kode Tiptap kamu init-nya nunggu event
    //    'DOMContentLoaded', event itu TIDAK akan fire lagi di sini
    //    (document sudah 'complete' sejak awal). Dispatch event
    //    custom sebagai gantinya -- update init code Tiptap kamu
    //    untuk dengar 'bundleReady' juga, atau pastikan init
    //    dipanggil langsung di bagian bawah script (bukan lewat
    //    addEventListener('DOMContentLoaded', ...)).
    document.dispatchEvent(new Event('bundleReady'));
  });
}

function readTextFile(pathOrRelative) {
  // path absolut (hasil extract, dari cordova.file.dataDirectory) -> baca via File API
  if (pathOrRelative.indexOf(cordova.file.dataDirectory) === 0) {
    return new Promise(function (resolve, reject) {
      window.resolveLocalFileSystemURL(pathOrRelative, function (fileEntry) {
        fileEntry.file(function (file) {
          var reader = new FileReader();
          reader.onloadend = function () { resolve(this.result); };
          reader.onerror = reject;
          reader.readAsText(file);
        }, reject);
      }, reject);
    });
  }

  // path relatif (FALLBACK_PAGE, bundled asset di www/) -> fetch biasa,
  // origin sama dengan bootstrap jadi aman dan IndexedDB tetap nyambung
  return fetch(pathOrRelative).then(function (res) {
    if (!res.ok) throw new Error('failed to load fallback: ' + res.status);
    return res.text();
  });
}

// ------------------------------------------------------------
// 3. Download zip + extract via JSZip ke writable storage
// ------------------------------------------------------------
function downloadAndExtractBundle(remote, targetDirPath) {
  var bundleUrl = configState.bundleUrlTemplate.replace('{version}', remote.version);
  var tmpZipPath = cordova.file.cacheDirectory + 'bundle-' + remote.version + '.zip';
  var stagingPath = cordova.file.dataDirectory + STAGING_DIR_NAME + '/';

  return new Promise(function (resolve, reject) {
    var ft = new FileTransfer();
    ft.download(
      bundleUrl,
      tmpZipPath,
      function (fileEntry) { resolve(fileEntry); },
      function (err) { reject(new Error('download failed: ' + JSON.stringify(err))); },
      false
    );
  })
  .then(function () {
    setStatus('Extracting...');
    return readFileAsArrayBuffer(tmpZipPath);
  })
  .then(function (arrayBuffer) {
    return JSZip.loadAsync(arrayBuffer);
  })
  .then(function (zip) {
    // Extract ke staging dulu, swap ke editor-current cuma kalau
    // bundle utuh (index.html ada). Kalau gagal di tengah, bundle
    // yang sedang dipakai tidak ikut terhapus.
    return removeDirIfExists(stagingPath)
      .then(function () { return ensureDir(stagingPath); })
      .then(function () { return extractZipTo(zip, stagingPath); })
      .then(function () {
        return fileExists(stagingPath + 'index.html').then(function (exists) {
          if (!exists) throw new Error('bundle rusak: index.html tidak ditemukan');
          return removeDirIfExists(targetDirPath)
            .then(function () { return moveDirTo(stagingPath, EDITOR_DIR_NAME); });
        });
      });
  })
  .then(function () {
    // opsional: verifikasi checksum di sini kalau server menyediakan
    return true;
  });
}

// Pindahkan folder hasil extract (staging) menjadi bundle aktif.
function moveDirTo(fromPath, newName) {
  return new Promise(function (resolve, reject) {
    window.resolveLocalFileSystemURL(fromPath, function (fromDir) {
      window.resolveLocalFileSystemURL(cordova.file.dataDirectory, function (parentDir) {
        fromDir.moveTo(parentDir, newName, function () { resolve(); }, reject);
      }, reject);
    }, reject);
  });
}

function extractZipTo(zip, targetDirPath) {
  var filenames = Object.keys(zip.files);
  var chain = Promise.resolve();

  filenames.forEach(function (filename) {
    var entry = zip.files[filename];
    if (entry.dir) return;

    chain = chain.then(function () {
      return entry.async('arraybuffer').then(function (content) {
        return writeFileEnsuringDir(targetDirPath + filename, content);
      });
    });
  });

  return chain;
}

// ------------------------------------------------------------
// 4. Helper cordova-plugin-file (promise wrapper)
// ------------------------------------------------------------
function readFileAsArrayBuffer(nativePath) {
  return new Promise(function (resolve, reject) {
    window.resolveLocalFileSystemURL(nativePath, function (fileEntry) {
      fileEntry.file(function (file) {
        var reader = new FileReader();
        reader.onloadend = function () { resolve(this.result); };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      }, reject);
    }, reject);
  });
}

function fileExists(nativePath) {
  return new Promise(function (resolve) {
    window.resolveLocalFileSystemURL(nativePath, function () { resolve(true); }, function () { resolve(false); });
  });
}

function ensureDir(dirPath) {
  // dirPath relatif ke dataDirectory, buat rekursif
  var parts = dirPath.replace(cordova.file.dataDirectory, '').split('/').filter(Boolean);
  var current = cordova.file.dataDirectory;

  return parts.reduce(function (chain, part) {
    return chain.then(function () {
      return new Promise(function (resolve, reject) {
        window.resolveLocalFileSystemURL(current, function (dirEntry) {
          dirEntry.getDirectory(part, { create: true }, function (newDir) {
            current = current + part + '/';
            resolve(newDir);
          }, reject);
        }, reject);
      });
    });
  }, Promise.resolve());
}

function removeDirIfExists(dirPath) {
  return new Promise(function (resolve) {
    window.resolveLocalFileSystemURL(dirPath, function (dirEntry) {
      dirEntry.removeRecursively(function () { resolve(); }, function () { resolve(); });
    }, function () { resolve(); }); // belum ada, tidak masalah
  });
}

function writeFileEnsuringDir(fullPath, arrayBuffer) {
  var relative = fullPath.replace(cordova.file.dataDirectory, '');
  var parts = relative.split('/');
  var fileName = parts.pop();
  var dirPath = cordova.file.dataDirectory + parts.join('/') + (parts.length ? '/' : '');

  return ensureDir(dirPath).then(function () {
    return new Promise(function (resolve, reject) {
      window.resolveLocalFileSystemURL(dirPath, function (dirEntry) {
        dirEntry.getFile(fileName, { create: true, exclusive: false }, function (fileEntry) {
          fileEntry.createWriter(function (writer) {
            writer.onwriteend = resolve;
            writer.onerror = reject;
            writer.write(new Blob([arrayBuffer]));
          }, reject);
        }, reject);
      }, reject);
    });
  });
}
