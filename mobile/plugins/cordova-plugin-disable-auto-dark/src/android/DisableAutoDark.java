package com.jtw.notes.disableautodark;

import android.os.Build;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.apache.cordova.CordovaInterface;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.CordovaWebView;

/**
 * The editor intentionally renders light in every theme. On Android the manifest
 * attribute android:forceDarkAllowed is ignored by the WebView for targetSdk 34+
 * (Android 13/14) — dark mode is controlled there by "algorithmic darkening".
 * This forces the actual WebView to opt out so the device theme cannot invert the UI.
 */
public class DisableAutoDark extends CordovaPlugin {

    @Override
    public void initialize(CordovaInterface cordova, CordovaWebView webView) {
        super.initialize(cordova, webView);
        try {
            WebView view = (WebView) webView.getEngine().getView();
            if (view == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // API 33+: manifest forceDarkAllowed is ignored; this is the real switch.
                view.setAlgorithmicDarkeningAllowed(false);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // API 29-32: classic force-dark.
                view.getSettings().setForceDark(WebSettings.FORCE_DARK_OFF);
            }
        } catch (Throwable ignored) {
            // Never crash the app over a rendering preference.
        }
    }
}