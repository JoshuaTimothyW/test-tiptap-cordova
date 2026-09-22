// Patches the generated CordovaLib SystemWebView so the editor never follows
// device dark mode. The manifest forceDarkAllowed attr is ignored on Android
// 13+/targetSdk 34 (algorithmic darkening is a WebView API), so we disable it
// in code: setAlgorithmicDarkeningAllowed(false) (API 33+) / FORCE_DARK_OFF (29-32).
// Idempotent. Run from mobile/ after `cordova platform add android`.
import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve('platforms/android/CordovaLib/src/org/apache/cordova/engine/SystemWebView.java')
if (!fs.existsSync(file)) throw new Error('SystemWebView.java not found at ' + file)

let src = fs.readFileSync(file, 'utf8')
if (src.includes('setAlgorithmicDarkeningAllowed')) {
  console.log('already patched, skipping')
  process.exit(0)
}

const ANCHOR = '' +
  '    public SystemWebView(Context context, AttributeSet attrs) {\n' +
  '        super(context, attrs);\n' +
  '    }\n'

const SNIPPET = '' +
  '    public SystemWebView(Context context, AttributeSet attrs) {\n' +
  '        super(context, attrs);\n' +
  '        // [patch:disable-dark] the webview must never invert to device dark mode\n' +
  '        // Reflection: compiled against an older android.jar, and the API set differs per level.\n' +
  '        try {\n' +
  '            if (android.os.Build.VERSION.SDK_INT >= 33) {\n' +
  '                android.webkit.WebView.class.getMethod("setAlgorithmicDarkeningAllowed", boolean.class).invoke(this, false);\n' +
  '            } else if (android.os.Build.VERSION.SDK_INT >= 29) {\n' +
  '                android.webkit.WebSettings s = getSettings();\n' +
  '                s.getClass().getMethod("setForceDark", int.class).invoke(s, 1); // FORCE_DARK_OFF\n' +
  '            }\n' +
  '        } catch (Throwable ignored) {}\n' +
  '    }\n'

if (!src.includes(ANCHOR)) throw new Error('anchor not found in SystemWebView.java, patch aborted')
fs.writeFileSync(file, src.replace(ANCHOR, SNIPPET), 'utf8')
console.log('patched', file)