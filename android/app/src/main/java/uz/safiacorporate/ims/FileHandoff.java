package uz.safiacorporate.ims;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Files between the site's pages and the phone. A web view has no download
 * manager: the page builds an Excel export (utils/exportXlsx.js saveBlob) or
 * a photo in memory and "clicks" a link to it, which a browser saves and a web
 * view silently ignores. app-bridge.js hands those bytes over instead, and
 * this class puts them where a phone user looks for them.
 */
final class FileHandoff {
    private static final String TAG = "SafiaFiles";

    private FileHandoff() {
    }

    /**
     * "save" keeps the file in Downloads (an export); "open" only shows it (a
     * photo opened "in a new tab"). Either way it is then opened in whatever app
     * the phone has for it. Runs off the main thread.
     */
    static void deliver(Activity activity, boolean save, String name, String mime, String base64, String lang) {
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            String type = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
            String file = fileName(name, type);
            Uri uri = save ? toDownloads(activity, file, type, bytes) : toCache(activity, file, bytes);
            activity.runOnUiThread(() -> {
                if (save) toast(activity, Texts.get(lang, Texts.DOWNLOADED, file));
                Intent view = new Intent(Intent.ACTION_VIEW)
                        .setDataAndType(uri, type)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    activity.startActivity(view);
                } catch (ActivityNotFoundException e) {
                    toast(activity, save ? Texts.get(lang, Texts.SAVED_NO_APP, file) : Texts.get(lang, Texts.NO_APP));
                }
            });
        } catch (Throwable e) {
            Log.w(TAG, "file not delivered", e);
            activity.runOnUiThread(() -> toast(activity, Texts.get(lang, Texts.SAVE_FAILED)));
        }
    }

    static void toast(Context context, String text) {
        Toast.makeText(context, text, Toast.LENGTH_LONG).show();
    }

    /** The system picker for an <input type=file>, filtered by the input's accept list. */
    static Intent pickerIntent(WebChromeClient.FileChooserParams params) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE);
        List<String> types = mimeTypes(params.getAcceptTypes());
        if (types.size() == 1) {
            intent.setType(types.get(0));
        } else {
            intent.setType("*/*");
            if (!types.isEmpty()) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toArray(new String[0]));
        }
        if (params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        }
        return intent;
    }

    static Uri[] pickedUris(Intent data) {
        if (data == null) return null;
        ClipData clip = data.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            Uri[] out = new Uri[clip.getItemCount()];
            for (int i = 0; i < out.length; i++) out[i] = clip.getItemAt(i).getUri();
            return out;
        }
        Uri one = data.getData();
        return one == null ? null : new Uri[]{one};
    }

    /**
     * The accept list as MIME types. The site writes extensions (".xlsx,.xlsb"),
     * which Android's picker does not understand; one it cannot translate lifts
     * the filter altogether rather than hide the very file the person wants.
     */
    private static List<String> mimeTypes(String[] accept) {
        Set<String> out = new LinkedHashSet<>();
        if (accept == null) return new ArrayList<>(out);
        for (String raw : accept) {
            if (raw == null) continue;
            for (String part : raw.split(",")) {
                String a = part.trim().toLowerCase(Locale.ROOT);
                if (a.isEmpty()) continue;
                if (a.startsWith(".")) {
                    String m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(a.substring(1));
                    if (m == null) return Collections.emptyList();
                    out.add(m);
                } else if (a.contains("/")) {
                    out.add(a);
                }
            }
        }
        return new ArrayList<>(out);
    }

    private static Uri toDownloads(Context context, String name, String mime, byte[] bytes) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentResolver resolver = context.getContentResolver();
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("Downloads refused the file");
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("Downloads gave no stream");
                out.write(bytes);
            }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, values, null, null);
            return uri;
        }
        // Android 7–9: no shared Downloads without a storage permission, so the
        // app's own folder, handed out through the FileProvider.
        File dir = new File(context.getExternalFilesDir(null), "Download");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no download folder");
        return write(context, unique(dir, name), bytes);
    }

    private static Uri toCache(Context context, String name, byte[] bytes) throws IOException {
        File dir = new File(context.getCacheDir(), "shared");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("no cache folder");
        return write(context, new File(dir, name), bytes);
    }

    private static Uri write(Context context, File file, byte[] bytes) throws IOException {
        try (OutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return FileProvider.getUriForFile(context, context.getPackageName() + ".files", file);
    }

    private static File unique(File dir, String name) {
        File f = new File(dir, name);
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String ext = dot > 0 ? name.substring(dot) : "";
        for (int i = 1; f.exists(); i++) f = new File(dir, base + " (" + i + ")" + ext);
        return f;
    }

    /** The server's own file name, made safe to store; a name with no extension gets its type's. */
    private static String fileName(String name, String mime) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        String ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(mime);
        if (n.isEmpty()) n = "safia-" + System.currentTimeMillis();
        if (ext != null && !n.toLowerCase(Locale.ROOT).endsWith("." + ext)) {
            if (n.lastIndexOf('.') <= 0) n = n + "." + ext;
        }
        return n.length() > 150 ? n.substring(n.length() - 150) : n;
    }
}
