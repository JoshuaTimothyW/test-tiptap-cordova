# ============================================================
# BUILD CORDOVA APK DI GOOGLE COLAB
# Copy tiap blok "# --- CELL n ---" jadi 1 cell terpisah di Colab
# ============================================================

# --- CELL 1: mount Drive (biar project tersimpan walau runtime reset) ---
from google.colab import drive
drive.mount('/content/drive')

PROJECT_DIR = '/content/drive/MyDrive/cordova-hotupdate-scaffold'
# Kalau baru pertama kali: upload/clone project scaffold ke path di atas dulu.


# --- CELL 2: install Java + Android SDK cmdline-tools ---
!apt-get install -y openjdk-17-jdk > /dev/null 2>&1

!mkdir -p /content/android-sdk/cmdline-tools
!wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O /content/cmdline-tools.zip
!unzip -q /content/cmdline-tools.zip -d /content/android-sdk/cmdline-tools
!mv /content/android-sdk/cmdline-tools/cmdline-tools /content/android-sdk/cmdline-tools/latest

import os
os.environ['JAVA_HOME'] = '/usr/lib/jvm/java-17-openjdk-amd64'
os.environ['ANDROID_SDK_ROOT'] = '/content/android-sdk'
os.environ['ANDROID_HOME'] = '/content/android-sdk'
os.environ['PATH'] += ':/content/android-sdk/cmdline-tools/latest/bin'
os.environ['PATH'] += ':/content/android-sdk/platform-tools'
os.environ['PATH'] += ':/content/android-sdk/build-tools/34.0.0'

print("SDK env ready")


# --- CELL 3: accept licenses + install platform & build-tools ---
!yes | sdkmanager --licenses > /dev/null 2>&1
!sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"


# --- CELL 4: install Node + Cordova CLI ---
!npm install -g cordova > /dev/null 2>&1
!cordova --version


# --- CELL 5: pindah ke project, add platform android, install plugin ---
%cd {PROJECT_DIR}

# PENTING: pastikan google-services.json sudah ada di root project
# (sejajar config.xml) SEBELUM add platform, kalau mau pakai push notification.
# Download dari Firebase Console > Project Settings > Android app.
import os
if not os.path.exists(f'{PROJECT_DIR}/google-services.json'):
    print("⚠ google-services.json belum ada -- push notification gak akan jalan.")
    print("   Local notification (update/share) tetap OK tanpa ini.")

# hanya perlu sekali per project; kalau platforms/ sudah ada, skip
!cordova platform add android || echo "platform android sudah ada"

# plugin sudah didefinisikan di config.xml, tapi jalankan ini untuk pastikan ke-install
!cordova prepare android


# --- CELL 6: build APK (debug dulu untuk testing cepat) ---
!cordova build android
# hasil ada di:
# platforms/android/app/build/outputs/apk/debug/app-debug.apk


# --- CELL 7 (opsional): build RELEASE signed APK ---
# Perlu keystore. Kalau belum punya, generate dulu:
# !keytool -genkey -v -keystore /content/drive/MyDrive/release-key.jks \
#     -alias mykeyalias -keyalg RSA -keysize 2048 -validity 10000

# Lalu buat build.json di root project (JANGAN commit ke git publik):
BUILD_JSON = """
{
  "android": {
    "release": {
      "keystore": "/content/drive/MyDrive/release-key.jks",
      "storePassword": "ISI_PASSWORD",
      "alias": "mykeyalias",
      "password": "ISI_PASSWORD",
      "keystoreType": ""
    }
  }
}
"""
with open(f'{PROJECT_DIR}/build.json', 'w') as f:
    f.write(BUILD_JSON)

!cordova build android --release
# hasil ada di:
# platforms/android/app/build/outputs/apk/release/app-release.apk


# --- CELL 8: download APK ke laptop ---
from google.colab import files
apk_path = f'{PROJECT_DIR}/platforms/android/app/build/outputs/apk/debug/app-debug.apk'
files.download(apk_path)

# CATATAN PENTING:
# - Colab suka disconnect setelah idle/lama. Karena project ada di Drive
#   (CELL 1), progress gak hilang -- tinggal jalankan ulang dari CELL 2
#   kalau runtime reset (SDK/Java perlu diinstall ulang tiap runtime baru,
#   tapi project code-nya aman).
# - Build pertama kali paling lama (download gradle wrapper dll),
#   build berikutnya lebih cepat karena ada cache di /root/.gradle
#   (tapi cache ini HILANG kalau runtime reset, karena bukan di Drive).
