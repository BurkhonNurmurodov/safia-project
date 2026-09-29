package uz.safiacorporate.ims;

/**
 * The admin's «open as this profile» (Profile.jsx, "?as=") inside the app — the
 * phone's version of the browser TAB it opens on a computer.
 *
 * A screen of its own on top of the admin's, with a web view of its own, and so
 * with its own sessionStorage: that is where the impersonated session lives
 * (utils/session.js, `tab: true`), so the admin's session on the screen beneath
 * is never touched. Everything else is MainActivity's — the same pages, the
 * same bridge, the same camera and downloads.
 *
 * It is left the way a tab is: the back button once the page has no history, or
 * the page's own «exit» and «close tab», which call window.close() — a web view
 * cannot close itself, so app-bridge.js hands that to MainActivity, which
 * finishes only this kind of screen. It is never rebuilt: the session died with
 * its web view, and the link that opened it is spent.
 */
public class SessionActivity extends MainActivity {
    @Override
    protected boolean isSession() {
        return true;
    }
}
