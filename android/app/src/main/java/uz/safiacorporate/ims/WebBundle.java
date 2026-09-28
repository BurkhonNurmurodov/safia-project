package uz.safiacorporate.ims;

import android.content.Context;
import android.content.res.AssetManager;
import android.net.Uri;
import android.util.Log;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The site's pages, served from INSIDE the APK (the operator's choice,
 * 2026-09-28: the app carries the pages; only data comes from the server).
 *
 * The web view is pointed at https://production.safiacorporate.uz itself and
 * this class answers that origin's page requests from assets/web — the
 * committed frontend/dist the build copied in (app/build.gradle, bundleWeb) —
 * while every server path (/api, /bot, /.well-known, the backend's /admin/…)
 * still goes over the network. One origin, so the site needs no change at all:
 * its relative URLs, its storage and its session work exactly as in a browser.
 *
 * Called on a WebView background thread; everything here is read-only after
 * the constructor.
 */
final class WebBundle {
    private static final String TAG = "SafiaBundle";

    private final AssetManager assets;
    /** Paths relative to assets/web, e.g. "index.html", "assets/index-abc.js". */
    private final Set<String> files = new HashSet<>();
    /** The live site's Content-Security-Policy, frozen with the pages it was written for. */
    private final String csp;
    final String version;

    WebBundle(Context context) {
        assets = context.getAssets();
        index("web", "");
        csp = trimToNull(readAsset(context, "csp.txt"));
        version = String.valueOf(trimToNull(readAsset(context, "web-version.txt")));
        Log.i(TAG, files.size() + " files, pages " + version + (csp == null ? ", NO CSP" : ""));
    }

    WebResourceResponse serve(WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!MainActivity.isOurs(url) || !"GET".equalsIgnoreCase(request.getMethod())) return null;
        String path = url.getPath() == null || url.getPath().isEmpty() ? "/" : url.getPath();
        if (isServerPath(path)) return null;
        // bundleWeb leaves sw.js out; a registration that still reaches here gets nothing.
        if (path.equals("/sw.js")) return notFound();
        String rel = path.equals("/") ? "index.html" : path.substring(1);
        if (files.contains(rel)) return file(rel);
        // Any other page address is a route of the single-page app.
        if (request.isForMainFrame()) return file("index.html");
        return null;
    }

    /**
     * What the SERVER answers, never the bundle. The SPA owns /admin and
     * /admin/upload (App.jsx, mirrored by SPA_ADMIN in src/sw.js); everything
     * else under /admin/ is a backend route.
     */
    static boolean isServerPath(String p) {
        return p.equals("/api") || p.startsWith("/api/")
                || p.startsWith("/bot/")
                || p.startsWith("/.well-known/")
                || p.equals("/health") || p.equals("/docs") || p.equals("/redoc") || p.equals("/openapi.json")
                || (p.startsWith("/admin/") && !p.equals("/admin/upload"));
    }

    static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse file(String rel) {
        try {
            InputStream in = assets.open("web/" + rel);
            String mime = mime(rel);
            Map<String, String> headers = new HashMap<>();
            if (rel.equals("index.html")) {
                headers.put("Cache-Control", "no-store");
                if (csp != null) headers.put("Content-Security-Policy", csp);
            }
            return new WebResourceResponse(mime, isText(mime) ? "UTF-8" : null, 200, "OK", headers, in);
        } catch (IOException e) {
            Log.w(TAG, "bundled file unreadable: " + rel, e);
            return null;
        }
    }

    private void index(String dir, String prefix) {
        try {
            String[] names = assets.list(dir);
            if (names == null) return;
            for (String name : names) {
                String path = dir + "/" + name;
                String[] children = assets.list(path);
                if (children != null && children.length > 0) index(path, prefix + name + "/");
                else files.add(prefix + name);
            }
        } catch (IOException e) {
            Log.w(TAG, "bundle index failed at " + dir, e);
        }
    }

    private static String mime(String rel) {
        String ext = rel.substring(rel.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (ext) {
            case "html": return "text/html";
            case "js": case "mjs": return "text/javascript";
            case "css": return "text/css";
            case "json": case "map": return "application/json";
            case "webmanifest": return "application/manifest+json";
            case "svg": return "image/svg+xml";
            case "png": return "image/png";
            case "jpg": case "jpeg": return "image/jpeg";
            case "webp": return "image/webp";
            case "gif": return "image/gif";
            case "ico": return "image/x-icon";
            case "woff": return "font/woff";
            case "woff2": return "font/woff2";
            case "ttf": return "font/ttf";
            case "txt": return "text/plain";
            case "wasm": return "application/wasm";
            default:
                String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                return m != null ? m : "application/octet-stream";
        }
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript")
                || mime.contains("svg") || mime.contains("manifest");
    }

    static String readAsset(Context context, String name) {
        try (InputStream in = context.getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        s = s.trim();
        return s.isEmpty() ? null : s;
    }
}
