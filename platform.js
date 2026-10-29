/* Platform layer for the standalone app.
   The UI code (main.js) talks to `claude.use("mcp" | "db" | "sample")`, the same
   interface it used inside Claude. Here those are backed by:
     mcp    -> Google Calendar REST API (OAuth token from Google sign-in)
     db     -> Cloud Firestore, private per signed-in user
     sample -> optional AI endpoint (Cloudflare Worker holding the API key)
*/
(function () {
  "use strict";
  var CFG = window.APP_CONFIG || {};
  var TZ = "Asia/Jerusalem";
  var SCOPES = [
    "openid", "email", "profile",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly"
  ].join(" ");
  var FB_VER = "10.12.2";
  var TOKEN_KEY = "yoman-gtoken";

  /* ---------- Google OAuth (redirect flow: works inside an iPhone home-screen app) ---------- */
  function redirectUri() { return location.origin + location.pathname; }
  function readTokenFromHash() {
    if (!location.hash || location.hash.indexOf("access_token=") < 0) {
      if (location.hash.indexOf("error=") >= 0) {
        var e = new URLSearchParams(location.hash.slice(1)).get("error");
        history.replaceState(null, "", location.pathname + location.search);
        try { sessionStorage.setItem("yoman-auth-error", e || "error"); } catch (x) {}
      }
      return;
    }
    var p = new URLSearchParams(location.hash.slice(1));
    var tok = { access_token: p.get("access_token"), expires_at: Date.now() + (parseInt(p.get("expires_in") || "3600", 10) - 120) * 1000 };
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tok)); localStorage.setItem("yoman-signed-in", "1"); } catch (x) {}
    history.replaceState(null, "", location.pathname + location.search);
  }
  function getToken() {
    try { var t = JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); if (t && t.access_token && t.expires_at > Date.now()) return t.access_token; } catch (x) {}
    return null;
  }
  function signIn(silent) {
    var u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", CFG.googleClientId);
    u.searchParams.set("redirect_uri", redirectUri());
    u.searchParams.set("response_type", "token");
    u.searchParams.set("scope", SCOPES);
    u.searchParams.set("include_granted_scopes", "true");
    if (CFG.loginHint) u.searchParams.set("login_hint", CFG.loginHint);
    if (silent) u.searchParams.set("prompt", "none");
    location.href = u.toString();
  }
  function signOut() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem("yoman-signed-in"); } catch (x) {}
    location.reload();
  }
  readTokenFromHash();
  window.appAuth = { signIn: function () { signIn(false); }, signOut: signOut, hasToken: function () { return !!getToken(); } };

  /* If the token expired, refresh it silently once (Google keeps the session). */
  var authErr = null; try { authErr = sessionStorage.getItem("yoman-auth-error"); sessionStorage.removeItem("yoman-auth-error"); } catch (x) {}
  var wasSignedIn = false; try { wasSignedIn = localStorage.getItem("yoman-signed-in") === "1"; } catch (x) {}
  if (!getToken() && wasSignedIn && !authErr) { signIn(true); return; }

  /* ---------- sign-in screen ---------- */
  function showLogin(msg) {
    if (document.getElementById("login")) return;
    var d = document.createElement("div");
    d.id = "login";
    d.innerHTML = '<div class="login-in"><div class="login-logo"><i></i><i></i><i></i><i></i></div><h1>' + (CFG.appName || "היומן שלי") + '</h1><p>' +
      (msg || "כניסה עם חשבון Google כדי לראות את היומן, הקניות והשגרות.") + '</p><button id="login-btn">כניסה עם Google</button></div>';
    document.body.appendChild(d);
    document.getElementById("login-btn").onclick = function () { signIn(false); };
  }
  if (!getToken()) {
    document.addEventListener("DOMContentLoaded", function () { showLogin(authErr ? "החיבור ל-Google נדרש שוב. לחצי כדי להתחבר." : null); });
  }

  /* ---------- Google Calendar as the "mcp" capability ---------- */
  function err(code, message, extra) { var e = { code: code, message: message || code }; if (extra) for (var k in extra) e[k] = extra[k]; return e; }
  function tzOffset(dateStr) {
    // "+02:00" / "+03:00" for Israel on that local date
    var d = new Date(dateStr.slice(0, 10) + "T12:00:00Z");
    var parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(d);
    var n = parts.filter(function (p) { return p.type === "timeZoneName"; })[0];
    var m = n && n.value.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? m[1] + ":" + (m[2] || "00") : "+02:00";
  }
  function rfc(local) { return /[zZ]|[+-]\d{2}:\d{2}$/.test(local) ? local : local + tzOffset(local); }
  function api(method, path, query, body) {
    var tok = getToken();
    if (!tok) { showLogin("החיבור ל-Google פג. לחצי כדי להתחבר שוב."); return Promise.reject(err("needs_reauth", "Signed out")); }
    var u = new URL("https://www.googleapis.com/calendar/v3" + path);
    if (query) Object.keys(query).forEach(function (k) { if (query[k] != null && query[k] !== "") u.searchParams.set(k, query[k]); });
    return fetch(u.toString(), {
      method: method,
      headers: Object.assign({ Authorization: "Bearer " + tok }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.status === 401) { try { localStorage.removeItem(TOKEN_KEY); } catch (x) {} showLogin("החיבור ל-Google פג. לחצי כדי להתחבר שוב."); throw err("needs_reauth", "Token expired"); }
      if (r.status === 403) throw err("tool_error", "אין הרשאה לפעולה הזו ביומן");
      if (r.status >= 500) throw err("server_unavailable", "Google Calendar לא זמין כרגע", { retryable: true });
      if (r.status === 204) return {};
      return r.json().then(function (j) { if (!r.ok) throw err("tool_error", (j.error && j.error.message) || "שגיאה"); return j; });
    }, function () { throw err("server_unavailable", "אין חיבור לרשת", { retryable: true }); });
  }
  function calId(input) { return encodeURIComponent(input.calendarId || "primary"); }
  var tools = {
    list_events: function (i) {
      return api("GET", "/calendars/" + calId(i) + "/events", {
        timeMin: i.startTime ? rfc(i.startTime) : new Date().toISOString(),
        timeMax: i.endTime ? rfc(i.endTime) : null,
        singleEvents: "true",
        orderBy: i.orderBy === "startTime" ? "startTime" : null,
        maxResults: i.pageSize || 250,
        pageToken: i.pageToken || null,
        q: i.fullText || null,
        timeZone: TZ
      }).then(function (j) {
        return {
          timeZone: j.timeZone || TZ,
          nextPageToken: j.nextPageToken,
          events: (j.items || []).map(function (e) {
            var o = Object.assign({}, e);
            if (e.reminders) { o.overrideReminders = e.reminders.overrides; o.useDefaultReminders = e.reminders.useDefault; }
            return o;
          })
        };
      });
    },
    update_event: function (i) {
      var b = {};
      ["summary", "description", "location", "colorId"].forEach(function (k) { if (i[k] != null) b[k] = i[k]; });
      if (i.overrideReminders) b.reminders = { useDefault: false, overrides: i.overrideReminders };
      return api("PATCH", "/calendars/" + calId(i) + "/events/" + encodeURIComponent(i.eventId), { sendUpdates: "none" }, b);
    },
    create_event: function (i) {
      var b = { summary: i.summary };
      if (i.description) b.description = i.description;
      if (i.location) b.location = i.location;
      if (i.allDay) { b.start = { date: i.startTime.slice(0, 10) }; b.end = { date: i.endTime.slice(0, 10) }; }
      else { b.start = { dateTime: rfc(i.startTime), timeZone: TZ }; b.end = { dateTime: rfc(i.endTime), timeZone: TZ }; }
      if (i.overrideReminders) b.reminders = { useDefault: false, overrides: i.overrideReminders };
      if (i.availability === "AVAILABILITY_FREE") b.transparency = "transparent";
      return api("POST", "/calendars/" + calId(i) + "/events", { sendUpdates: "none" }, b);
    }
  };
  var mcp = {
    callTool: function (server, tool, input) {
      if (!tools[tool]) return Promise.reject(err("not_in_manifest", tool));
      return tools[tool](input || {}).then(function (payload) { return { content: [], payload: payload }; });
    },
    watchTool: function (server, tool, input, handler) {
      var dead = false;
      mcp.callTool(server, tool, input).then(function (r) { if (!dead) handler({ type: "data", result: r }); }, function (e) { if (!dead) handler({ type: "error", error: e }); });
      return function () { dead = true; };
    },
    invalidate: function () { return Promise.resolve(); },
    listTools: function () { return Promise.resolve({ servers: [{ server: "Google Calendar", authStatus: getToken() ? "connected" : "needs_reauth", tools: Object.keys(tools).map(function (n) { return { name: n, description: "" }; }) }] }); }
  };

  /* ---------- Firestore as the "db" capability ---------- */
  var dbPromise = null;
  function initDb() {
    if (dbPromise) return dbPromise;
    if (!CFG.firebase || !CFG.firebase.apiKey) { dbPromise = Promise.resolve(null); return dbPromise; }
    var base = "https://www.gstatic.com/firebasejs/" + FB_VER + "/";
    dbPromise = Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]).then(function (m) {
      var appM = m[0], authM = m[1], fs = m[2];
      var app = appM.initializeApp(CFG.firebase);
      var auth = authM.getAuth(app);
      var store = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });
      var ready = new Promise(function (resolve) {
        var un = authM.onAuthStateChanged(auth, function (u) {
          if (u) { un(); resolve(u); return; }
          var tok = getToken();
          if (!tok) return; // wait for sign-in
          authM.signInWithCredential(auth, authM.GoogleAuthProvider.credential(null, tok)).catch(function () {});
        });
      });
      return ready.then(function (user) {
        var root = "users/" + user.uid + "/";
        function snapOf(s) { return { id: s.id, exists: s.exists(), data: function () { return s.exists() ? s.data() : undefined; }, metadata: s.metadata }; }
        function docRef(path) {
          var r = fs.doc(store, root + path);
          return {
            id: r.id, path: path,
            get: function () { return fs.getDoc(r).then(snapOf); },
            set: function (d) { return fs.setDoc(r, d); },
            update: function (d) { return fs.updateDoc(r, d); },
            delete: function () { return fs.deleteDoc(r); },
            onSnapshot: function (next, error) { return fs.onSnapshot(r, function (s) { next(snapOf(s)); }, error); },
            collection: function (p) { return colRef(path + "/" + p); }
          };
        }
        function colRef(path) {
          var c = fs.collection(store, root + path);
          return {
            path: path,
            doc: function (id) { return docRef(path + "/" + (id || fs.doc(c).id)); },
            add: function (d) { var r = fs.doc(c); return fs.setDoc(r, d).then(function () { return docRef(path + "/" + r.id); }); },
            get: function () { return fs.getDocs(c).then(function (q) { var docs = q.docs.map(snapOf); return { docs: docs, size: docs.length, empty: !docs.length }; }); },
            onSnapshot: function (next, error) {
              return fs.onSnapshot(c, function (q) { var docs = q.docs.map(snapOf); next({ docs: docs, size: docs.length, empty: !docs.length, docChanges: function () { return []; }, metadata: q.metadata }); }, error);
            }
          };
        }
        return Object.freeze({ doc: docRef, collection: colRef, user: user });
      });
    }).catch(function (e) { console.error("Firebase failed", e); return null; });
    return dbPromise;
  }

  /* ---------- optional AI endpoint as the "sample" capability ---------- */
  function blobToB64(b) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result).split(",")[1]); }; r.onerror = rej; r.readAsDataURL(b); }); }
  var sample = null;
  if (CFG.aiEndpoint) {
    var ask = function (input, opts) {
      opts = opts || {};
      var imgs = opts.images ? Array.prototype.slice.call(opts.images.length != null ? opts.images : [opts.images]) : [];
      return Promise.all(imgs.map(function (b) { return blobToB64(b).then(function (d) { return { type: b.type || "image/jpeg", data: d }; }); })).then(function (images) {
        return fetch(CFG.aiEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: input, images: images, tier: opts.modelTier || "default" }) });
      }).then(function (r) {
        if (r.status === 429) throw err("rate_limited", "busy");
        if (!r.ok) throw err("upstream_error", "AI error");
        return r.json();
      }).then(function (j) { return { text: j.text || "", truncated: false }; });
    };
    sample = function (input, opts) { return ask(input, opts); };
    sample.json = function (input, opts) {
      return ask(input + "\n\nהחזר JSON תקין בלבד, בלי טקסט נוסף.", opts).then(function (r) {
        var t = r.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
        var a = t.indexOf("{"), b = t.lastIndexOf("}");
        try { return JSON.parse(a >= 0 ? t.slice(a, b + 1) : t); } catch (e) { throw err("invalid_json", "bad json", { text: r.text }); }
      });
    };
    sample.limits = function () { return Promise.resolve({ maxInputBytes: 200000, images: { maxCount: 4, maxBytes: 5000000, mediaTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"] } }); };
  }

  /* ---------- the claude.use() surface main.js expects ---------- */
  window.claude = Object.freeze({
    use: function (name) {
      if (name === "mcp") return Promise.resolve(getToken() ? mcp : null);
      if (name === "db") return initDb();
      if (name === "sample") return Promise.resolve(sample);
      return Promise.resolve(null);
    }
  });

  /* ---------- offline shell ---------- */
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
})();
