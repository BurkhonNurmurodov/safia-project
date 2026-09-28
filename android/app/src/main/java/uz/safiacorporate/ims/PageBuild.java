package uz.safiacorporate.ims;

import java.util.Collections;
import java.util.Map;

/**
 * One build of the site's pages — the copy built into the APK, or one the app
 * downloaded when the site was deployed (PageUpdates). Immutable: WebBundle
 * swaps whole builds, never files of one.
 */
final class PageBuild {
    /** The VERSION the build was made from, e.g. "4.171.0". */
    final String version;
    /** build.json's buildTime: THE identity of a build (a rebuild of one version is another build). */
    final String buildTime;
    /** The Content-Security-Policy the site sent with this build's index.html. */
    final String csp;
    /**
     * Path as in the site's URLs, without the leading slash ("index.html",
     * "assets/index-abc.js") → the SHA-256 of its contents, or "asset:" + path
     * for a built-in file whose hash is not known.
     */
    final Map<String, String> files;
    /** Its file under files/web/builds, or null for the copy built into the APK. */
    final String name;

    PageBuild(String version, String buildTime, String csp, Map<String, String> files, String name) {
        this.version = version;
        this.buildTime = buildTime;
        this.csp = csp;
        this.files = Collections.unmodifiableMap(files);
        this.name = name;
    }

    boolean builtIn() {
        return name == null;
    }

    /** "4.171.0 built in" / "4.171.3 downloaded" — for logs and failure reports. */
    String describe() {
        return version + (builtIn() ? " built in" : " downloaded");
    }
}
