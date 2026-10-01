package uz.safiacorporate.ims;

import android.Manifest;
import android.annotation.SuppressLint;
import android.annotation.TargetApi;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.Settings;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.ConsoleMessage;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.ServiceWorkerClientCompat;
import androidx.webkit.ServiceWorkerControllerCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.Collections;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Safia IMS for Android: the site's pages in the app's own web view — no
 * Chrome, no "Running in Chrome" (CLAUDE.md, «The Android app»).
 *
 * The pages come from the phone (WebBundle) — the copy built into the APK, then
 * each build the site deploys, downloaded by PageUpdates — and the data from
 * the server. What a browser gives a page for free and a web view does not is
 * supplied here:
 * downloads (app-bridge.js + FileHandoff), the file picker, the camera, new
 * tabs and links to other apps, the back button, and room for the status bar
 * and the keyboard. A second SESSION — the admin's «open as this profile» —
 * is a screen of its own on top of this one (SessionActivity).
 */
public class MainActivity extends ComponentActivity {
    static final String HOST = "production.safiacorporate.uz";
    static final String ORIGIN = "https://" + HOST;
    private static final String TAG = "SafiaApp";
    /** The site's dark base background, until the page says otherwise. */
    private static final int DARK = 0xFF0F1117;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private FrameLayout root;
    private WebView web;
    private WebBundle bundle;
    private PageUpdates updates;
    /** The APK's own updates; the main screen only (null on a session screen). */
    private AppUpdates appUpdates;
    private final Runnable pagesReady = this::announcePages;
    private String bridgeScript;
    private boolean bridgeAtDocumentStart;
    private OnBackPressedCallback back;
    private ValueCallback<Uri[]> pendingFiles;
    private PermissionRequest pendingCamera;
    private String themeColor = "";
    /** The language the person picked on the site, as the page last reported it. */
    private volatile String siteLang = "uz";

    private final ActivityResultLauncher<Intent> filePicker = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> deliverFiles(result.getResultCode(), result.getData()));
    private final ActivityResultLauncher<String> cameraPermission = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), this::answerCamera);
    /** Android 13+: phone notifications need the person's yes (Push). */
    private final ActivityResultLauncher<String> notifyPermission = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(), granted -> {
                Push.markAsked(this);
                sendPushStatus();
            });
    private final Runnable pushChanged = this::sendPushStatus;

    static boolean isOurs(Uri u) {
        return u != null && "https".equalsIgnoreCase(u.getScheme()) && HOST.equalsIgnoreCase(u.getHost());
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Edge to edge (Android 15+ insists): the page gets the space between the
        // bars and above the keyboard as padding, and the bars show the page's colour.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        bundle = WebBundle.get(this);
        updates = PageUpdates.get(this);
        // A session screen rebuilt by Android (the process was killed, or a
        // setting no configChanges covers) lost what it was: the impersonated
        // session lived in its web view's sessionStorage, and its link is spent.
        if (isSession() && savedInstanceState != null) {
            finish();
            return;
        }
        bridgeScript = WebBundle.readAsset(this, "app-bridge.js");
        if (!isSession()) appUpdates = new AppUpdates(this, () -> siteLang);

        root = new FrameLayout(this);
        root.setBackgroundColor(DARK);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets i = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        applyBarIcons(false);

        back = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                if (web != null && web.canGoBack()) web.goBack();
            }
        };
        getOnBackPressedDispatcher().addCallback(this, back);

        blockServiceWorkers();
        configure(web);
        // Opened from a phone notification: its rows are read now.
        if (!isSession()) Push.opened(getApplicationContext(), getIntent());
        Uri data = getIntent() == null ? null : getIntent().getData();
        if (!isSession() && isSessionLink(data)) {
            // «Open as this profile» arrived as a link: this screen keeps the
            // person's own session and the other one opens on top of it. Consumed,
            // so a rebuilt screen does not spend the (already spent) code again.
            web.loadUrl(ORIGIN + "/");
            getIntent().setData(null);
            openSession(data);
        } else {
            web.loadUrl(startUrl(getIntent()));
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // A phone notification (Push) arrives here too, with the rows it showed.
        Push.opened(getApplicationContext(), intent);
        // A production link tapped in another app (the verified app link). A tap on
        // the launcher icon carries none and leaves the page where it was.
        Uri u = intent.getData();
        if (web == null || !isOurs(u)) return;
        if (isSessionLink(u)) openSession(u);
        else web.loadUrl(u.toString());
    }

    @Override
    protected void onResume() {
        super.onResume();
        // On screen: follow the site's deploys (PageUpdates), and be the page
        // told when one is whole — the slot holds ONE page, and a session screen
        // that was on top of this one took it.
        updates.setOnReady(pagesReady);
        updates.resume();
        if (appUpdates != null) appUpdates.onResume();
        if (!isSession()) Push.setListener(pushChanged);
    }

    @Override
    protected void onPause() {
        super.onPause();
        updates.pause();
        if (appUpdates != null) appUpdates.onPause();
        Push.clearListener(pushChanged);
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        updates.clearOnReady(pagesReady);
        if (appUpdates != null) appUpdates.destroy();
        if (pendingFiles != null) pendingFiles.onReceiveValue(null);
        if (pendingCamera != null) pendingCamera.deny();
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        io.shutdown();
        super.onDestroy();
    }

    /**
     * True on the screen that holds a second session (SessionActivity): it is
     * closed by the page (window.close, app-bridge.js) and never rebuilt.
     */
    protected boolean isSession() {
        return false;
    }

    /** The admin's «open as this profile» (Profile.jsx): a one-time code in "?as=". */
    static boolean isSessionLink(Uri u) {
        return isOurs(u) && u.getQueryParameter("as") != null;
    }

    /**
     * A second session, in the app: a screen of its own on top of this one,
     * with a web view of its own — so the session the page starts there lives
     * in THAT web view's sessionStorage (utils/session.js, `tab: true`) and
     * this one's is never touched. Back, or the page's own exit, returns here.
     */
    private void openSession(Uri u) {
        try {
            startActivity(new Intent(this, SessionActivity.class).setData(u));
        } catch (Exception e) {
            Log.w(TAG, "could not open the second session", e);
            FileHandoff.toast(this, Texts.get(siteLang(), Texts.NO_APP));
        }
    }

    private static String startUrl(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        return isOurs(u) ? u.toString() : ORIGIN + "/";
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configure(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);  // the proof camera's live preview
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportMultipleWindows(true);             // target=_blank → onCreateWindow
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        // The pages are laid out for the size Telegram shows them at; a large
        // system font would break the dense tables rather than enlarge them.
        s.setTextZoom(100);
        s.setUserAgentString(s.getUserAgentString() + " SafiaIMS-Android/" + appVersion());
        w.setBackgroundColor(DARK);
        w.setWebViewClient(new PageClient());
        w.setWebChromeClient(new ChromeClient());
        w.setDownloadListener((url, userAgent, disposition, mime, length) -> openOutside(Uri.parse(url)));
        installBridge(w);
    }

    /** window.SafiaAndroid for app-bridge.js — this origin only, never a page from anywhere else. */
    @SuppressLint("JavascriptInterface")
    private void installBridge(WebView w) {
        Set<String> origins = Collections.singleton(ORIGIN);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(w, "SafiaAndroid", origins,
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> onBridge(message.getData()));
        } else {
            w.addJavascriptInterface(new LegacyBridge(), "SafiaAndroid");
        }
        if (bridgeScript != null && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(w, bridgeScript, origins);
            bridgeAtDocumentStart = true;
        }
    }

    /** Old web views without WebMessageListener: the same message, its origin checked by hand. */
    private final class LegacyBridge {
        @JavascriptInterface
        public void postMessage(String data) {
            runOnUiThread(() -> {
                if (web != null && isOurs(Uri.parse(String.valueOf(web.getUrl())))) onBridge(data);
            });
        }
    }

    private void onBridge(String data) {
        if (data == null) return;
        // An export arrives as megabytes of base64: parse and write it off the main thread.
        io.execute(() -> {
            try {
                JSONObject m = new JSONObject(data);
                String lang = m.optString("lang");
                if (!lang.isEmpty()) siteLang = lang;
                switch (m.optString("type")) {
                    case "save":
                    case "open":
                        FileHandoff.deliver(this, "save".equals(m.optString("type")),
                                m.optString("name"), m.optString("mime"), m.optString("data"), lang);
                        break;
                    case "theme":
                        String color = m.optString("color");
                        runOnUiThread(() -> applyTheme(color));
                        break;
                    case "close":
                        // window.close(): a web view cannot close itself. Only a
                        // session screen is ever closed by its page; the app's
                        // own screen stays whatever the page asks.
                        if (isSession()) runOnUiThread(this::finish);
                        break;
                    case "failed":
                        Log.w(TAG, "the page could not hand over a file: " + m.optString("message"));
                        runOnUiThread(() -> FileHandoff.toast(this, Texts.get(lang, Texts.SAVE_FAILED)));
                        break;
                    // Phone notifications (utils/androidPush.js ↔ Push). Never
                    // from a session screen: that session is the admin's look at
                    // somebody else, and the phone's notifications are its owner's.
                    case "push-register":
                        if (isSession()) break;
                        Push.register(getApplicationContext(), m.optString("token"), m.optString("profile"), lang);
                        runOnUiThread(this::askNotificationsOnce);
                        sendPushStatus();
                        break;
                    case "push-clear":
                        if (!isSession()) Push.clear(getApplicationContext());
                        break;
                    case "push-cursor":
                        if (isSession()) break;
                        Push.language(getApplicationContext(), lang);
                        Push.cursor(getApplicationContext(), m.optLong("latest"));
                        break;
                    case "push-seen":
                        if (!isSession()) Push.cancelAll(getApplicationContext());
                        break;
                    case "push-status":
                        sendPushStatus();
                        break;
                    case "push-enable":
                        if (!isSession()) runOnUiThread(this::enableNotifications);
                        break;
                    case "push-test":
                        if (isSession()) break;
                        long id = m.optLong("id");
                        Push.EXEC.execute(() -> Push.poll(getApplicationContext(), true, id));
                        break;
                    default:
                        break;
                }
            } catch (Exception e) {
                Log.w(TAG, "bridge message dropped", e);
            }
        });
    }

    /** The phone-notification state, for the settings dialog (utils/androidPush.js). */
    private void sendPushStatus() {
        if (isSession()) return;
        String json = Push.status(getApplicationContext()).toString();
        runOnUiThread(() -> {
            if (web != null) {
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('safia-push',{detail:" + json + "}))", null);
            }
        });
    }

    /** Android 13+ asks once by itself, the first time somebody signs in here. */
    private void askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < 33 || Push.allowed(this) || Push.asked(this)) return;
        notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS);
    }

    /** «Yoqish»: Android's own prompt while it will still show one, its
     *  notification settings for this app after that. */
    private void enableNotifications() {
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED
                && (!Push.asked(this) || shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))) {
            notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS);
            return;
        }
        Intent settings = Build.VERSION.SDK_INT >= 26
                ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
        try {
            startActivity(settings);
        } catch (Exception e) {
            FileHandoff.toast(this, Texts.get(siteLang(), Texts.NO_APP));
        }
    }

    /**
     * A newly deployed build is whole on the phone: the site's own update
     * prompt (hooks/useAppUpdate.js) asks now rather than at its next poll.
     */
    private void announcePages() {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('safia-build-check'))", null);
        });
    }

    /**
     * No service worker, ever: the app keeps its own pages (WebBundle,
     * PageUpdates), and a worker would fill its cache from the SERVER and serve
     * that instead — two builds in one app. app-bridge.js refuses the
     * registration; this refuses the fetch.
     */
    private void blockServiceWorkers() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            return;
        }
        ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(new ServiceWorkerClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                return WebBundle.notFound();
            }
        });
    }

    private final class PageClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return bundle.serve(request);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (isOurs(u)) return false;
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (scheme.equals("about") || scheme.equals("javascript")) return false;
            // blob: and data: are handed over by app-bridge.js; never navigate the app away to one.
            if (scheme.equals("blob") || scheme.equals("data")) return true;
            openOutside(u);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            // Web views too old for document-start scripts get the bridge as early as they allow.
            if (!bridgeAtDocumentStart && bridgeScript != null && isOurs(Uri.parse(url))) {
                view.evaluateJavascript(bridgeScript, null);
            }
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            back.setEnabled(view.canGoBack());
        }

        @TargetApi(Build.VERSION_CODES.O)
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            // The page engine died (out of memory, or a crash). Left alone, it takes
            // the whole app with it; start the screen over instead.
            FailureReport.send(MainActivity.this, "page engine stopped",
                    "didCrash=" + detail.didCrash() + " · priority=" + detail.rendererPriorityAtExit());
            if (view == web) {
                root.removeView(web);
                web.destroy();
                web = null;
                // A session screen cannot be rebuilt: its session died with the
                // web view, and its link is spent. It closes instead.
                if (isSession()) finish();
                else recreate();
            }
            return true;
        }
    }

    private final class ChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (pendingFiles != null) pendingFiles.onReceiveValue(null);
            pendingFiles = callback;
            try {
                filePicker.launch(FileHandoff.pickerIntent(params));
                return true;
            } catch (ActivityNotFoundException e) {
                pendingFiles = null;
                return false;
            }
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> askCamera(request));
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (pendingCamera == request) pendingCamera = null;
        }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            // A new tab: a throwaway web view whose first real address decides where it goes.
            WebView popup = new WebView(MainActivity.this);
            popup.setWebViewClient(new PopupClient());
            ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }

        @Override
        public void onCloseWindow(WebView window) {
            window.destroy();
        }

        @Override
        public boolean onConsoleMessage(ConsoleMessage m) {
            int level = m.messageLevel() == ConsoleMessage.MessageLevel.ERROR ? Log.ERROR : Log.INFO;
            Log.println(level, "SafiaWeb", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
            return true;
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false);
        }
    }

    /**
     * Where a new tab goes: a page of ours opens here, in the same session;
     * anything else opens in the app the phone has for it. One exception — the
     * admin's «open as this profile» (Profile.jsx, "?as=") exists to start a
     * SEPARATE session, so it opens as a screen of its own on top of this one
     * (SessionActivity) rather than replace this one.
     */
    private final class PopupClient extends WebViewClient {
        private boolean routed;

        private boolean route(WebView popup, Uri u) {
            if (routed || u == null || "about".equalsIgnoreCase(u.getScheme())) return false;
            routed = true;
            if (isOurs(u)) {
                if (isSessionLink(u)) openSession(u);
                else if (web != null) web.loadUrl(u.toString());
            } else {
                openOutside(u);
            }
            popup.stopLoading();
            popup.post(popup::destroy);
            return true;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return route(view, request.getUrl());
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            route(view, Uri.parse(url));
        }

        // Popups share the page engine with the main view; when it dies, an
        // unhandled popup would take the whole app down with it.
        @TargetApi(Build.VERSION_CODES.O)
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            view.destroy();
            return true;
        }
    }

    /** The camera, for this site only — the proof camera's getUserMedia. */
    private void askCamera(PermissionRequest request) {
        boolean video = Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE);
        if (!isOurs(request.getOrigin()) || !video) {
            request.deny();
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            return;
        }
        if (pendingCamera != null) pendingCamera.deny();
        pendingCamera = request;
        cameraPermission.launch(Manifest.permission.CAMERA);
    }

    private void answerCamera(boolean granted) {
        PermissionRequest request = pendingCamera;
        pendingCamera = null;
        if (request == null) return;
        if (granted) request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        else request.deny();
    }

    private void deliverFiles(int resultCode, Intent data) {
        ValueCallback<Uri[]> callback = pendingFiles;
        pendingFiles = null;
        if (callback == null) return;
        callback.onReceiveValue(resultCode == RESULT_OK ? FileHandoff.pickedUris(data) : null);
    }

    /** Something that is not one of our pages: the app the phone has for it (Telegram for t.me, …). */
    private void openOutside(Uri u) {
        if (isOurs(u)) {
            openInBrowser(u);
            return;
        }
        try {
            Intent intent;
            if ("intent".equalsIgnoreCase(u.getScheme())) {
                intent = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE);
            }
            startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            FileHandoff.toast(this, Texts.get(siteLang(), Texts.NO_APP));
        }
    }

    /**
     * One of our own addresses that must open OUTSIDE the app. Pinned to the
     * phone's browser, or the verified app link would bring it straight back here.
     */
    private void openInBrowser(Uri u) {
        Intent intent = new Intent(Intent.ACTION_VIEW, u)
                .addCategory(Intent.CATEGORY_BROWSABLE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ResolveInfo browser = getPackageManager().resolveActivity(
                new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/")).addCategory(Intent.CATEGORY_BROWSABLE),
                PackageManager.MATCH_DEFAULT_ONLY);
        if (browser != null && browser.activityInfo != null
                && !"android".equals(browser.activityInfo.packageName)
                && !getPackageName().equals(browser.activityInfo.packageName)) {
            intent.setPackage(browser.activityInfo.packageName);
        }
        try {
            startActivity(intent);
        } catch (Exception e) {
            FileHandoff.toast(this, Texts.get(siteLang(), Texts.NO_APP));
        }
    }

    /** The bars follow the page's theme: ThemeContext keeps <meta name="theme-color"> on its background. */
    private void applyTheme(String css) {
        if (css == null || css.equals(themeColor)) return;
        Integer color = parseCssColor(css);
        if (color == null) return;
        themeColor = css;
        root.setBackgroundColor(color);
        applyBarIcons(isLight(color));
    }

    private void applyBarIcons(boolean lightBackground) {
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(lightBackground);
        bars.setAppearanceLightNavigationBars(lightBackground);
    }

    static Integer parseCssColor(String css) {
        String s = css.trim().toLowerCase(Locale.ROOT);
        try {
            if (s.startsWith("#")) {
                if (s.length() == 4) {
                    s = "#" + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2) + s.charAt(3) + s.charAt(3);
                }
                return s.length() == 7 ? Color.parseColor(s) : null;
            }
            if (s.startsWith("rgb")) {
                String[] p = s.substring(s.indexOf('(') + 1, s.indexOf(')')).trim().split("[,\\s/]+");
                return Color.rgb(Math.round(Float.parseFloat(p[0])), Math.round(Float.parseFloat(p[1])),
                        Math.round(Float.parseFloat(p[2])));
            }
        } catch (Exception ignored) {
            // Not a colour this understands: the bars keep what they have.
        }
        return null;
    }

    private static boolean isLight(int color) {
        double luma = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255;
        return luma > 0.6;
    }

    /** For messages raised outside a bridge call; the bridge messages carry their own. */
    private String siteLang() {
        return siteLang;
    }

    private String appVersion() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }
}
