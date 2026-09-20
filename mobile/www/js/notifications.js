// ============================================================
// NOTIFICATIONS
// 1. Local  -> update editor selesai dipasang, konten share masuk
// 2. Push   -> broadcast dari server via Firebase Cloud Messaging
// ============================================================
var Notify = {};

// Push config di-set dari remote config (lihat config.js) saat bootstrap jalan.
var PUSH_TOPIC = 'all-users';
var PUSH_TOKEN_REGISTER_URL = '';

Notify.setPushConfig = function (cfg) {
  var ep = AppConfig.endpoints(cfg);
  PUSH_TOKEN_REGISTER_URL = ep.pushRegisterUrl;
  PUSH_TOPIC = ep.pushTopic;
};

// ------------------------------------------------------------
// LOCAL NOTIFICATIONS (cordova-plugin-local-notification)
// ------------------------------------------------------------
Notify.local = function (title, text, extra) {
  if (!(window.cordova && cordova.plugins && cordova.plugins.notification)) {
    console.warn('[notify] local-notification plugin belum ready');
    return;
  }
  cordova.plugins.notification.local.schedule({
    id: Date.now() % 1000000,
    title: title,
    text: text,
    foreground: true,
    smallIcon: 'res://ic_stat_notify',
    data: extra || {}
  });
};

Notify.updateInstalled = function (version) {
  Notify.local('Editor diperbarui', 'Versi ' + version + ' siap dipakai.');
};

Notify.shareReceived = function (contentPreview) {
  var preview = String(contentPreview || '').slice(0, 80);
  Notify.local('Konten diterima', preview);
};

// ------------------------------------------------------------
// PUSH NOTIFICATIONS (cordova-plugin-firebasex)
// ------------------------------------------------------------
Notify.initPush = function () {
  if (!window.FirebasePlugin) {
    console.warn('[notify] FirebasePlugin belum ready (cek plugin ke-install & google-services.json ada)');
    return;
  }

  FirebasePlugin.hasPermission(function (hasPermission) {
    if (!hasPermission) FirebasePlugin.grantPermission();
  });

  FirebasePlugin.subscribe(PUSH_TOPIC,
    function () { console.log('[notify] subscribed ke topic', PUSH_TOPIC); },
    function (err) { console.warn('[notify] gagal subscribe topic', err); }
  );

  FirebasePlugin.getToken(function (token) {
    registerTokenToServer(token);
  }, function (error) {
    console.error('[notify] gagal ambil FCM token', error);
  });

  FirebasePlugin.onTokenRefresh(function (token) {
    registerTokenToServer(token);
  }, function (error) {
    console.error('[notify] token refresh error', error);
  });

  // push diterima saat app terbuka (foreground)
  FirebasePlugin.onMessageReceived(function (payload) {
    console.log('[notify] push diterima', payload);
    // payload.tap ada isinya kalau user buka app dari tap notifikasi di tray
    // (background/killed). Bisa dipakai untuk deep-link ke bagian tertentu.
  }, function (error) {
    console.error('[notify] onMessageReceived error', error);
  });
};

function registerTokenToServer(token) {
  fetch(PUSH_TOKEN_REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token, platform: 'android' })
  }).catch(function (e) {
    console.warn('[notify] gagal kirim token ke server (gpp, akan retry saat refresh)', e);
  });
}
