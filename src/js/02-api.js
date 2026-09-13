  /* ---------- api client ----------
     Discovers the API base URL, first match wins:
       1. window.TL_API                                  (inline script or devtools override)
       2. localStorage "tl-api" (explicit, device-only Admin connection test)
       3. <meta name="tl-api" content="https://toploaded-api.<you>.workers.dev">
       4. same-origin "/api" when served from localhost
       5. public api-config.json (GitHub repository variable TL_API_URL)
     With no base, or when GET /health fails, TL.api.online stays false and every
     feature uses its demo / localStorage fallback. Worker routes have NO /api prefix;
     the dev server strips it.

       TL.api.request(method, path, body, opts) → Promise<json>; rejects {status, error, data}
       TL.api.get/post/put/del(path, ...)
       TL.api.call(method, path, body, demoFn)   → request when online, else Promise.resolve(demoFn())
       TL.api.setAuth(token, role)               persists to sessionStorage, emits 'auth:change'
       TL.api.ready                              Promise<boolean online>
  */
  TL.api = (function(){
    function baseUrl(value){
      var u = new URL(String(value).trim());
      var loopback = ["localhost", "127.0.0.1", "[::1]"].indexOf(u.hostname) >= 0;
      if((u.protocol !== "https:" && !(u.protocol === "http:" && loopback && ["localhost","127.0.0.1","[::1]"].indexOf(location.hostname)>=0)) || u.username || u.password || u.search || u.hash || /REPLACE|example\./i.test(u.href)) throw new Error("Use the HTTPS API base URL, without credentials or query parameters.");
      return u.href.replace(/\/+$/, "");
    }
    function discover(){
      try {
        if(window.TL_API) return baseUrl(window.TL_API);
        var s = TL.store.get("api", null);
        if(s) return baseUrl(s);
        var m = document.querySelector('meta[name="tl-api"]');
        if(m && m.content && m.content.trim()) return baseUrl(m.content);
        var h = location.hostname;
        if(h === "localhost" || h === "127.0.0.1" || h === "[::1]") return location.origin + "/api";
      } catch(e){}
      return null;
    }
    var api = {
      base: discover(),
      online: false,
      token: null,
      role: null,
      health: null,
      integrations: null,
      validateBase: baseUrl
    };
    api.request = function(method, path, body, opts){
      opts = opts || {};
      if(!api.base) return Promise.reject({status:0, error:"offline"});
      if(!/^\/(?!\/)/.test(path)) return Promise.reject({status:0,error:"invalid API path"});
      if(!api.online && (opts.token || (api.token && !opts.noAuth))) return Promise.reject({status:0,error:"API connection not verified"});
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, opts.timeout || 8000) : null;
      var headers = {"Accept":"application/json"};
      var hasBody = body !== undefined && body !== null;
      if(hasBody) headers["Content-Type"] = "application/json";
      if(opts.token) headers["Authorization"] = "Bearer " + opts.token;
      else if(api.token && !opts.noAuth) headers["Authorization"] = "Bearer " + api.token;
      return fetch(api.base + path, {
        method: method, headers: headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: ctrl ? ctrl.signal : undefined, credentials: "omit", cache: "no-store", redirect: "error"
      }).then(function(r){
        clearTimeout(timer);
        return r.text().then(function(t){
          var d = null;
          try { d = t ? JSON.parse(t) : null; } catch(e){ d = {raw: t}; }
          if(!r.ok){
            if(r.status === 401 && api.token && !opts.noAuth && !opts.token) api.setAuth(null, null);
            throw {status: r.status, error: (d && d.error) || r.statusText || "error", data: d};
          }
          return d;
        });
      }, function(e){
        clearTimeout(timer);
        throw {status: 0, error: (e && e.name === "AbortError") ? "timeout" : "network"};
      });
    };
    api.get = function(path, opts){ return api.request("GET", path, null, opts); };
    api.post = function(path, body, opts){ return api.request("POST", path, body || {}, opts); };
    api.put = function(path, body, opts){ return api.request("PUT", path, body || {}, opts); };
    api.del = function(path, opts){ return api.request("DELETE", path, null, opts); };
    api.call = function(method, path, body, demoFn){
      if(api.online) return api.request(method, path, body);
      return Promise.resolve().then(function(){ return demoFn ? demoFn() : null; });
    };
    api.setAuth = function(token, role){
      api.token = token || null; api.role = role || null;
      TL.session.set("auth-base", api.base || "demo");
      if(api.token) TL.session.set("token", api.token); else TL.session.del("token");
      if(api.role) TL.session.set("role", api.role); else TL.session.del("role");
      TL.emit("auth:change", {role: api.role});
    };
    // Probe new endpoints anonymously: no staff/customer token is sent to a candidate.
    api.probe = async function(value){
      var base = baseUrl(value), ctrl = new AbortController(), timer = setTimeout(function(){ctrl.abort();}, 5000);
      try {
        var r = await fetch(base + "/health", {headers:{Accept:"application/json"},credentials:"omit",cache:"no-store",redirect:"error",signal:ctrl.signal});
        var d = r.ok ? await r.json() : null;
        if(!d || d.ok !== true || d.service !== "toploaded-api" || d.apiVersion !== 1) throw new Error("Not a compatible Top Loaded API. Check its URL, deployment and CORS settings.");
        return {base:base,health:d};
      } finally {clearTimeout(timer);}
    };
    api.ready = (async function(){
      if(!api.base){
        try {
          var r = await fetch("api-config.json", {cache:"no-store",credentials:"omit",redirect:"error",signal:AbortSignal.timeout(4000)});
          var d = r.ok ? await r.json() : null;
          if(d && d.version === 1 && d.apiBase) api.base = baseUrl(d.apiBase);
        } catch(e){} // Missing file keeps the disconnected static preview usable.
      }
      if(TL.session.get("auth-base", null) === (api.base || "demo")){
        api.token = TL.session.get("token", null); api.role = TL.session.get("role", null);
      } else { TL.session.del("token"); TL.session.del("role"); }
      if(!api.base) return false;
      try {
        var p = await api.probe(api.base);
        api.health = p.health; api.integrations = p.health.integrations || {}; api.online = true;
      } catch(e){ api.online = false; }
      return api.online;
    })();
    return api;
  })();
