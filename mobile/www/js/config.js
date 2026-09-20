// ============================================================
// REMOTE CONFIG
// Satu URL hardcoded di bawah. Server meng-hosting config.json ini.
// Semua endpoint lain (version/bundle/push) dibaca dari config
// tersebut -> pindah server tanpa rebuild APK = cukup ganti file.
// ============================================================
var AppConfig = {};

// TODO: ganti ke repo release kamu. Pattern "latest/download" =
// GitHub selalu ambil asset dari release paling baru.
var REMOTE_CONFIG_URL = 'https://github.com/jtw/notes-editor/releases/latest/download/config.json';

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

AppConfig.get = function () {
  var cached = {};
  try { cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || '{}'); } catch (e) {}

  return fetch(REMOTE_CONFIG_URL, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('config fetch failed: ' + res.status);
      return res.json();
    })
    .then(function (json) {
      var merged = Object.assign({}, cached, json, { configUrl: REMOTE_CONFIG_URL });
      try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(merged)); } catch (e) {}
      return merged;
    })
    .catch(function () {
      // offline / gagal fetch: pakai config terakhir yang pernah ada, atau default
      return Object.assign({}, cached, { configUrl: REMOTE_CONFIG_URL });
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