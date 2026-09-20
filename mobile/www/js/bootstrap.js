// ============================================================
// KONFIGURASI - endpoint dibaca dari REMOTE CONFIG (config.js)
// ============================================================
var EDITOR_DIR_NAME = 'editor-current';
var FALLBACK_PAGE = 'editor-fallback.html'; // bundled, dipakai kalau belum pernah online

var statusEl = document.getElementById('status');
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
  console.log('[bootstrap]', msg);
}

document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  setStatus('Mengecek pembaruan editor...');
  Notify.initPush();
  captureShareIntent(function () {
    runUpdateFlow();
  });
}

// ------------------------------------------------------------
// 1. Tangkap konten yang di-share dari app lain (share sheet)
// ------------------------------------------------------------
function captureShareIntent(done) {
  if (!window.plugins || !window.plugins.webintent) return done();

  window.plugins.webintent.getUri(function (uri) {
    handleIncomingShare(uri);
    done();
  }, function () {
    done();
  });

  // kalau app sudah running di background dan menerima share baru
  window.plugins.webintent.onNewIntent(function (uri) {
    handleIncomingShare(uri);
  });
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
// 2. Cek versi, download bundle baru kalau ada, lalu redirect
// ------------------------------------------------------------
var configState = { versionUrl: '', bundleUrlTemplate: '' };

function runUpdateFlow() {
  var localVersion = localStorage.getItem('editor_version') || '0';
  var targetDirPath = cordova.file.dataDirectory + EDITOR_DIR_NAME + '/';

  AppConfig.get()
    .then(function (cfg) {
      configState = AppConfig.endpoints(cfg);
      Notify.setPushConfig(cfg); // pushRegisterUrl/pushTopic untuk register token
      return doUpdate(localVersion, targetDirPath);
    })
    .catch(function () {
      console.warn('config gagal, pakai default');
      configState = AppConfig.endpoints({});
      return doUpdate(localVersion, targetDirPath);
    });
}

function doUpdate(localVersion, targetDirPath) {
  return fetchVersionInfo(configState.versionUrl)
    .then(function (remote) {
      if (!remote) throw new Error('no remote info');

      if (remote.version !== localVersion) {
        setStatus('Update tersedia (v' + remote.version + '), mengunduh...');
        return downloadAndExtractBundle(remote, targetDirPath).then(function () {
          localStorage.setItem('editor_version', remote.version);
          Notify.updateInstalled(remote.version);
          return targetDirPath + 'index.html';
        });
      } else {
        return resolveEntry(targetDirPath);
      }
    })
    .catch(function (err) {
      console.warn('update check gagal, fallback ke cache/local', err);
      return resolveEntry(targetDirPath);
    })
    .then(function (entryUrl) {
      redirectTo(entryUrl);
    })
    .catch(function () {
      redirectTo(FALLBACK_PAGE);
    });
}

function fetchVersionInfo(versionUrl) {
  return fetch(versionUrl, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('version fetch failed: ' + res.status);
      return res.json(); // { version: "1.2.0", checksum: "..." }
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
  setStatus('Memuat editor...');
  return loadBundleIntoCurrentPage(entryPath);
}

function loadBundleIntoCurrentPage(entryPath) {
  return readTextFile(entryPath).then(function (htmlText) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(htmlText, 'text/html');

    // 1. pindahkan <link>/<style> dari head bundle ke head halaman ini
    var headNodes = doc.head ? Array.prototype.slice.call(doc.head.childNodes) : [];
    headNodes.forEach(function (node) {
      if (node.tagName === 'LINK' || node.tagName === 'STYLE') {
        document.head.appendChild(document.importNode(node, true));
      }
    });

    // 2. ganti body halaman ini dengan body bundle (tanpa script dulu)
    var newBody = document.importNode(doc.body, true);
    var scripts = Array.prototype.slice.call(newBody.querySelectorAll('script'));
    scripts.forEach(function (s) { s.parentNode.removeChild(s); }); // buang dulu, jalankan manual di bawah

    document.body.innerHTML = '';
    while (newBody.firstChild) {
      document.body.appendChild(newBody.firstChild);
    }

    // 3. jalankan ulang tiap <script> secara manual
    //    (script yang masuk lewat innerHTML TIDAK auto-execute)
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

    setStatus('');
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
    if (!res.ok) throw new Error('gagal load fallback: ' + res.status);
    return res.text();
  });
}

// ------------------------------------------------------------
// 3. Download zip + extract via JSZip ke writable storage
// ------------------------------------------------------------
function downloadAndExtractBundle(remote, targetDirPath) {
  var bundleUrl = configState.bundleUrlTemplate.replace('{version}', remote.version);
  var tmpZipPath = cordova.file.cacheDirectory + 'bundle-' + remote.version + '.zip';

  return new Promise(function (resolve, reject) {
    var ft = new FileTransfer();
    ft.download(
      bundleUrl,
      tmpZipPath,
      function (fileEntry) { resolve(fileEntry); },
      function (err) { reject(new Error('download gagal: ' + JSON.stringify(err))); },
      false
    );
  })
  .then(function () {
    setStatus('Mengekstrak...');
    return readFileAsArrayBuffer(tmpZipPath);
  })
  .then(function (arrayBuffer) {
    return JSZip.loadAsync(arrayBuffer);
  })
  .then(function (zip) {
    return removeDirIfExists(targetDirPath)
      .then(function () { return ensureDir(targetDirPath); })
      .then(function () { return extractZipTo(zip, targetDirPath); });
  })
  .then(function () {
    // opsional: verifikasi checksum di sini kalau server menyediakan
    return true;
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
