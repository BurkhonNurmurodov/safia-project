import Cocoa
import WebKit

// Headless-ish WKWebView probe: loads the production mini-app in the same
// engine class Telegram-for-macOS uses, mirrors console/error/CSP events to
// stdout, then samples boot state + resource timings at fixed offsets.

let url = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "https://production.safiacorporate.uz/"
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)

final class Handler: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    let t0 = Date()
    func ts() -> String { String(format: "%6.2fs", Date().timeIntervalSince(t0)) }
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        print("[\(ts())] page: \(m.body)")
    }
    func webView(_ w: WKWebView, didStartProvisionalNavigation n: WKNavigation!) { print("[\(ts())] nav: start") }
    func webView(_ w: WKWebView, didCommit n: WKNavigation!) { print("[\(ts())] nav: commit") }
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { print("[\(ts())] nav: didFinish (load event)") }
    func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { print("[\(ts())] nav: didFail \(e)") }
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { print("[\(ts())] nav: provisional fail \(e)") }
    func webViewWebContentProcessDidTerminate(_ w: WKWebView) { print("[\(ts())] nav: CONTENT PROCESS TERMINATED") }
}

let h = Handler()
let cfg = WKWebViewConfiguration()
cfg.websiteDataStore = .nonPersistent()   // cold cache, like a first open
let ucc = cfg.userContentController
let hook = """
(function(){
  function send(t){ try{ window.webkit.messageHandlers.probe.postMessage(String(t)); }catch(e){} }
  ['log','warn','error','info'].forEach(function(k){
    var o = console[k];
    console[k] = function(){
      send(k + ': ' + Array.prototype.map.call(arguments, function(a){
        try { return typeof a === 'string' ? a : (a && a.stack) || JSON.stringify(a); } catch(e){ return String(a); }
      }).join(' '));
      try { o.apply(console, arguments); } catch(e){}
    };
  });
  window.addEventListener('error', function(e){
    var t = e.target && e.target.tagName ? e.target : null;
    send('window.error: ' + (e.message || '') + ' @' + (e.filename || '') + ':' + (e.lineno || '') +
      (t ? ' [resource ' + t.tagName + ' ' + (t.src || t.href || '') + ']' : ''));
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    send('unhandledrejection: ' + (e.reason && (e.reason.stack || e.reason.message || e.reason)));
  });
  window.addEventListener('securitypolicyviolation', function(e){
    send('CSP violation: ' + e.violatedDirective + ' blocked ' + e.blockedURI);
  });
})();
"""
ucc.addUserScript(WKUserScript(source: hook, injectionTime: .atDocumentStart, forMainFrameOnly: true))
ucc.add(h, name: "probe")

let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800), configuration: cfg)
wv.navigationDelegate = h
print("default UA: \(wv.value(forKey: "userAgent") ?? "?")")
wv.load(URLRequest(url: URL(string: url)!))

func snapshot(_ label: String, andExit: Bool = false) {
    let js = """
    (function(){
      var r = document.getElementById('root');
      var res = performance.getEntriesByType('resource')
        .filter(function(e){ return /\\/assets\\/|telegram-web-app|googleapis|gstatic/.test(e.name); })
        .map(function(e){ return e.name.replace(/^https?:\\/\\/[^\\/]+/, '') + ' start=' + Math.round(e.startTime) +
          ' end=' + Math.round(e.responseEnd) + ' bytes=' + (e.transferSize || 0) + ' proto=' + (e.nextHopProtocol || '?'); });
      var nav = performance.getEntriesByType('navigation')[0];
      return JSON.stringify({
        stage: window.__bootStage || null,
        rootNodes: r ? r.childNodes.length : -1,
        overlay: !!document.getElementById('boot-debug'),
        slowScreen: !!document.getElementById('boot-slow'),
        recoveryCard: !!document.getElementById('boot-tech'),
        overlayText: ((document.getElementById('boot-debug') || {}).innerText || '').replace(/\\s+/g, ' ').slice(0, 220) || null,
        docReady: document.readyState,
        navProto: nav && nav.nextHopProtocol, navResponseEnd: nav && Math.round(nav.responseEnd),
        resources: res
      }, null, 1);
    })()
    """
    wv.evaluateJavaScript(js) { v, e in
        print("[\(h.ts())] snapshot \(label): \(v ?? "nil") \(e.map { "err=\($0)" } ?? "")")
        if andExit { exit(0) }
    }
}
let times: [Double] = (CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "3,8,12,20")
    .split(separator: ",").compactMap { Double($0) }
for (i, t) in times.enumerated() {
    DispatchQueue.main.asyncAfter(deadline: .now() + t) { snapshot("\(t)s", andExit: i == times.count - 1) }
}
DispatchQueue.main.asyncAfter(deadline: .now() + (times.last ?? 20) + 10) { print("hard exit"); exit(1) }
app.run()
