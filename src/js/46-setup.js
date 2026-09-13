  /* Connection tests are anonymous. Reports require a fresh server admin session. */
  (function(){
    var form=$("#apiSetupForm"), status=$("#apiSetupStatus"), input=$("#apiSetupUrl");
    if(!form)return;
    var candidate=null, report=null, seq=0, busy=false;
    function clearSessions(){
      ["token","role","auth-base","customer-session"].forEach(function(k){TL.session.del(k);});
    }
    function resetConnection(){ TL.store.del("api"); clearSessions(); location.reload(); }
    function signedIn(){return TL.api.online && TL.api.token && TL.auth.role()==="admin";}
    function buttons(){
      $("#apiSetupRefresh").disabled=busy||!signedIn(); $("#apiSetupVerify").disabled=busy||!signedIn();
      $("#apiSetupExport").disabled=!report||!signedIn();
      $("#apiSetupReset").disabled=!TL.store.get("api",null);
      $("#apiSetupUse").disabled=!candidate||!$("#apiSetupConsent").checked;
    }
    function invalidate(){candidate=null;$("#apiSetupConfirm").hidden=true;$("#apiSetupConsent").checked=false;buttons();}
    input.addEventListener("input",function(){seq++;invalidate();});
    $("#apiSetupConsent").addEventListener("change",buttons);
    form.addEventListener("submit",async function(e){
      e.preventDefault(); var version=++seq; invalidate(); $("#apiSetupTest").disabled=true;
      status.textContent="Checking this URL without sending any session or credentials…";
      try{
        var p=await TL.api.probe(input.value);
        if(version!==seq)return;
        candidate=p.base; status.textContent="Compatible API found at "+p.base+". Confirm the address before using it. This is only a liveness check, not a payment or security acceptance test.";
        $("#apiSetupConfirm").hidden=false;
      }catch(err){if(version===seq)status.textContent="Could not verify this API. Check the HTTPS base URL, compatible Worker deployment and SITE_ORIGIN/CORS. No connection was saved.";}
      finally{$("#apiSetupTest").disabled=false;buttons();}
    });
    $("#apiSetupUse").addEventListener("click",function(){
      if(!candidate||!$("#apiSetupConsent").checked)return;
      if(!TL.store.set("api",candidate)){status.textContent="Browser storage is blocked; connection was not changed.";return;}
      clearSessions(); location.reload();
    });
    $("#apiSetupReset").addEventListener("click",resetConnection);
    // Recovery remains reachable from the login dialog even if the candidate API goes down.
    var recovery=$("#apiResetOverride");
    if(recovery){recovery.hidden=!TL.store.get("api",null);recovery.addEventListener("click",resetConnection);}
    function renderReport(){
      var probes={}; (report.probes||[]).forEach(function(p){probes[p.id]=p;});
      $("#apiSetupResults").innerHTML=(report.checks||[]).map(function(c){
        var p=probes[c.id];
        return '<article class="api-setup-check"><h4>'+esc(c.title)+'<span class="pill">'+esc(c.state)+'</span></h4><p>'+esc(c.detail)+'</p>'+(c.missing.length?'<p>Needed: '+c.missing.map(esc).join(', ')+'</p>':'')+(p?'<p><b>'+(p.ok?'Read verified':'Not verified')+'</b> · '+esc(p.detail)+'</p>':'')+'</article>';
      }).join("");
      status.textContent="Checked "+new Date(report.checkedAt).toLocaleString()+" · Square "+report.mode+". Secret values are never included. Sandbox acceptance remains required.";
    }
    async function check(verify){
      if(!signedIn()||busy)return;
      busy=true;buttons();status.textContent=verify?"Running read-only provider checks…":"Checking required configuration…";
      try{
        var d=await TL.api.request(verify?"POST":"GET",verify?"/setup/verify":"/setup/status",verify?{}:null,{timeout:15000});
        if(!signedIn())return;
        if(!d||d.version!==1||!Array.isArray(d.checks))throw new Error();
        report=d;renderReport();
      }catch(e){report=null;$("#apiSetupResults").textContent="";status.textContent="Setup check unavailable. Sign in as API admin and ensure the latest Worker is deployed. No shop settings were changed.";}
      finally{busy=false;buttons();}
    }
    $("#apiSetupRefresh").addEventListener("click",function(){check(false);});
    $("#apiSetupVerify").addEventListener("click",function(){check(true);});
    $("#apiSetupExport").addEventListener("click",function(){
      if(!report||!signedIn())return;
      var url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:"application/json"})),a=document.createElement("a");
      a.href=url;a.download="toploaded-api-readiness.json";a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
    });
    function current(){
      $("#apiSetupCurrent").textContent="Current: "+(TL.api.base||"No API connected")+(TL.store.get("api",null)?" · this browser only":" · published/default connection");
      if(!input.value)input.value=TL.api.base||"";buttons();
      if(!signedIn())status.textContent="Connect the Worker and sign in with its admin passcode to view configuration checks. No keys are needed in this page.";
    }
    TL.on("api:ready",current);
    TL.on("view:change",function(d){if(d.name==="admin"){current();if(!report)check(false);}});
    TL.on("auth:change",function(){if(!signedIn()){seq++;invalidate();report=null;$("#apiSetupResults").textContent="";}buttons();});
    current();
  })();
