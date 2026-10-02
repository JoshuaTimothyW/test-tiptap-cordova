// ============================================================
// REMOTE CONFIG
// Satu URL hardcoded di bawah. Server meng-hosting config.json ini.
// Semua endpoint lain (version/bundle/push) dibaca dari config
// tersebut -> pindah server tanpa rebuild APK = cukup ganti file.
// ============================================================
var AppConfig = {};

// TODO: ganti ke repo release kamu. Pattern "latest/download" =
// GitHub selalu ambil asset dari release paling baru.
var REMOTE_CONFIG_URL = 'https://github.com/JoshuaTimothyW/test-tiptap-cordova/releases/latest/download/config.json';

var CONFIG_CACHE_KEY = 'app_config_cache';
var CONFIG_DEFAULTS = {
  versionUrl: 'editor/version.json',
  bundleUrlTemplate: 'editor/bundle-{version}.zip',
  pushRegisterUrl: 'push/register-token',
  pushTopic: 'all-users'
};

// Resolve endpoint absolut: no scheme -> relative ke origin config file.
function resolveUrl(baseUrl, endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  var base = baseUrl.replace(/\/[^\/]*$/, '/'); // path config.json -> direktori config
  return base + endpoint;
}

// fetch() dari halaman file:// ke release asset GitHub SELALU gagal:
// GitHub nggak mengirim header access-control-allow-origin sama sekali (dan
// URL-nya butuh 2x 302 ke release-assets.githubusercontent.com), jadi CORS
// memblokir pembacaannya. setAllowUniversalAccessFromFileURLs() juga default
// false di cordova-android. FileTransfer jalan di layer native, jadi sama
// sekali nggak kena CORS -- itu satu-satunya cara app ini bisa baca
// config.json / version.json dari GitHub.
function nativeFetchText(url, ok, fail) {
  var tmp = cordova.file.cacheDirectory + 'meta-' + Date.now() + '.tmp';
  var cleanup = function () { try { cordova.file.remove(tmp); } catch (e) {} };
  new FileTransfer().download(url, tmp, function () {
    window.resolveLocalFileSystemURL(tmp, function (entry) {
      entry.file(function (file) {
        var reader = new FileReader();
        reader.onloadend = function () { cleanup(); ok(reader.result); };
        reader.onerror = function () { cleanup(); fail(new Error('baca file gagal')); };
        reader.readAsText(file);
      }, fail);
    }, fail);
  }, function (err) {
    cleanup();
    fail(new Error('download failed: ' + JSON.stringify(err)));
  }, false);
}

AppConfig.get = function () {
  var cached = {};
  try { cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || '{}'); } catch (e) {}

  return new Promise(function (resolve) {
    nativeFetchText(REMOTE_CONFIG_URL,
      function (text) {
        var merged;
        try { merged = Object.assign({}, cached, JSON.parse(text), { configUrl: REMOTE_CONFIG_URL }); }
        catch (e) { merged = Object.assign({}, cached, { configUrl: REMOTE_CONFIG_URL }); }
        try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(merged)); } catch (e) {}
        resolve(merged);
      },
      function (err) {
        // offline / gagal ambil: pakai config terakhir yang pernah ada, atau default
        console.warn('[config]', err && err.message);
        resolve(Object.assign({}, cached, { configUrl: REMOTE_CONFIG_URL }));
      });
  });
};

// Resolve semua endpoint config ke URL absolut berdasarkan config yang ada.
AppConfig.endpoints = function (config) {
  var base = config.configUrl || REMOTE_CONFIG_URL;
  return {
    versionUrl: resolveUrl(base, config.versionUrl || CONFIG_DEFAULTS.versionUrl),
    bundleUrlTemplate: resolveUrl(base, config.bundleUrlTemplate || CONFIG_DEFAULTS.bundleUrlTemplate),
    pushRegisterUrl: resolveUrl(base, config.pushRegisterUrl || CONFIG_DEFAULTS.pushRegisterUrl),
    pushTopic: config.pushTopic || CONFIG_DEFAULTS.pushTopic
  };
};