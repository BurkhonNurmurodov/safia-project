/*
 * Safia IMS for Android: the bridge between the site's pages (built into the
 * APK, served by WebBundle.java) and the phone. MainActivity injects it before
 * the page's own scripts, on https://production.safiacorporate.uz only.
 *
 * A web view has no download manager and no tabs, so three things the site
 * does in a browser would silently do nothing — or worse — here (and a fourth,
 * window.close(), is handed to the app below):
 *   - saveBlob() in utils/exportXlsx.js "clicks" an <a download href="blob:…">;
 *   - a proof photo is opened with window.open("blob:…");
 *   - the service worker would fetch the SERVER's build into a cache and serve
 *     it in place of the pages this APK carries.
 * The first two hand the file to Android through window.SafiaAndroid (a
 * WebMessageListener limited to this origin); the third is refused.
 *
 * Plain ES5 on purpose: it runs before anything else, on whatever web view
 * the phone has.
 */
(function () {
  "use strict";
  if (window.__safiaAndroid) return;
  window.__safiaAndroid = true;
  // What this APK can do beyond a browser, for the pages to ask
  // (utils/androidPush.js reads `push`: phone notifications, 1.5.0+).
  window.__safiaApp = { push: 1 };

  try {
    if (navigator.serviceWorker && navigator.serviceWorker.register) {
      navigator.serviceWorker.register = function () {
        return Promise.reject(new Error("service workers are off in the Android app"));
      };
    }
  } catch (e) { /* nothing to switch off */ }

  // The language picked on the site (LangContext), so the app's own messages match the page.
  function lang() {
    try { return localStorage.getItem("lang") || "uz"; } catch (e) { return "uz"; }
  }

  function post(message) {
    try {
      message.lang = lang();
      window.SafiaAndroid.postMessage(JSON.stringify(message));
    } catch (e) { /* no bridge on this web view: nothing more can be done */ }
  }

  function toBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var s = String(reader.result || "");
        resolve(s.slice(s.indexOf(",") + 1));
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function handOver(kind, url, name) {
    fetch(url)
      .then(function (res) { return res.blob(); })
      .then(function (blob) {
        return toBase64(blob).then(function (data) {
          post({ type: kind, name: name || "", mime: blob.type || "", data: data });
        });
      })
      .catch(function (e) { post({ type: "failed", message: String((e && e.message) || e) }); });
  }

  var LOCAL = /^(blob|data):/i;

  // A link to an in-memory file, clicked by a person or by code: a download
  // attribute means "save" (an export), none means "show" (a photo).
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a || !LOCAL.test(a.href)) return;
    e.preventDefault();
    handOver(a.hasAttribute("download") ? "save" : "open", a.href, a.getAttribute("download") || "");
  }, true);

  // The same for a link clicked while detached from the page, where the click
  // event never reaches the listener above.
  var anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!this.isConnected && LOCAL.test(this.href || "")) {
      handOver(this.hasAttribute("download") ? "save" : "open", this.href, this.getAttribute("download") || "");
      return;
    }
    return anchorClick.apply(this, arguments);
  };

  var windowOpen = window.open;
  window.open = function (url) {
    if (typeof url === "string" && LOCAL.test(url)) {
      handOver("open", url, "");
      return null;
    }
    return windowOpen.apply(window, arguments);
  };

  // window.close(): a web view cannot close itself, so the app does it — and
  // only for a screen holding a second session (SessionActivity, the admin's
  // «open as this profile»), whose «exit» and «close tab» call this.
  window.close = function () {
    post({ type: "close" });
  };

  // The status bar follows the page: ThemeContext keeps <meta name="theme-color">
  // on the page's own background, in the dark theme and the light one.
  var lastTheme = "";
  function sendTheme() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var color = meta ? meta.getAttribute("content") || "" : "";
    if (color && color !== lastTheme) {
      lastTheme = color;
      post({ type: "theme", color: color });
    }
  }
  function watchTheme() {
    sendTheme();
    if (window.MutationObserver && document.head) {
      new MutationObserver(sendTheme).observe(document.head, {
        subtree: true, childList: true, attributes: true, attributeFilter: ["content"],
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchTheme);
  else watchTheme();
})();
