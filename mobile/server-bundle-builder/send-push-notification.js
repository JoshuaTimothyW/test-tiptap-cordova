/**
 * Broadcast push notification ke semua device yang subscribe topic 'all-users'.
 * Biasanya dipanggil setelah build-bundle.js sukses & bundle sudah di-upload,
 * supaya user yang buka app langsung dapat notif + auto-update.
 *
 * Setup:
 *   npm install firebase-admin
 *   Download service-account.json dari Firebase Console:
 *   Project Settings > Service Accounts > Generate new private key
 *
 * Usage:
 *   node send-push-notification.js 1.2.0
 */
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const TOPIC = 'all-users'; // harus sama dengan PUSH_TOPIC di www/js/notifications.js

async function broadcastUpdate(version) {
  const message = {
    notification: {
      title: 'Update tersedia',
      body: `Editor versi ${version} sudah bisa dipakai. Buka app untuk update otomatis.`
    },
    data: {
      type: 'editor_update',
      version: version
    },
    topic: TOPIC
  };

  const res = await admin.messaging().send(message);
  console.log('✔ push terkirim ke topic', TOPIC, '- messageId:', res);
}

const version = process.argv[2];
if (!version) {
  console.error('Usage: node send-push-notification.js <version>');
  process.exit(1);
}

broadcastUpdate(version).catch((err) => {
  console.error('gagal kirim push:', err);
  process.exit(1);
});
