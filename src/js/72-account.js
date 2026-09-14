  /* Customer read-only portal. Never falls back to sample balances or a simulated login. */
  (function(){
    var guest = $("#accountGuest"), member = $("#accountMember"), status = $("#accountStatus");
    if(!guest) return;
    var saved = TL.session.get("customer-session", null), token = saved && saved.exp > Date.now() ? saved.token : null;
    var challenge = null, enabled = false, generation = 0, availabilityVersion = 0;
    function call(method, path, body, override){ return TL.api.request(method, path, body, {noAuth:true, token:override || token}); }
    function error(e){ return e && e.error ? e.error : "Could not reach the shop. Please try again."; }
    function reset(){
      token = null; saved = null; challenge = null; generation++; TL.session.del("customer-session");
      member.hidden = true; guest.hidden = false;
      $('#accountCodeForm').hidden=true;$('#accountEmailForm').hidden=!enabled;$('#accountCode').value='';
      $("#accountHistory").textContent = ""; $("#accountBalance").textContent = "—"; $("#accountWho").textContent = "";
    }
    function stamp(iso){
      var d = new Date(iso); return isNaN(d.getTime()) ? "Date unavailable" : d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
    }
    async function refresh(){
      var version = generation, button = $("#accountRefresh");
      button.disabled = true; status.textContent = "Checking your latest balance…";
      try {
        var data = await call("GET", "/account/me");
        if(version !== generation) return;
        guest.hidden = true; member.hidden = false; $("#accountWho").textContent = data.email;
        $("#accountLinkNote").hidden = data.linked;
        $("#accountBalance").textContent = data.linked ? TL.money(data.customer.balance) : "—";
        $("#accountUpdated").textContent = data.linked ? "Ledger updated " + stamp(data.customer.updatedAt) : "No verified credit record linked yet.";
        $("#accountHistory").innerHTML = data.linked && data.entries.length ? data.entries.map(function(e){
          return '<div class="account-entry"><div>' + TL.esc(e.kind === "redeem" ? "Credit redeemed" : e.kind === "adjust" ? "Balance adjustment" : "Trade-in credit") + '<small>' + TL.esc(stamp(e.at)) + '</small></div><strong>' + (e.amount < 0 ? "−" : "+") + TL.money(Math.abs(e.amount)) + '<small>Balance ' + TL.money(e.balanceAfter) + '</small></strong></div>';
        }).join("") : '<p>No credit activity to display.</p>';
        status.textContent = data.needsReview ? "The shop needs to review the email link before displaying your balance. Please contact the counter." : data.linked ? "Balance checked just now. Only shop staff can change it." : "Signed in. Ask the shop to link the same email to your credit record.";
      } catch(e){
        if(version !== generation) return;
        if(e.status === 401) reset();
        status.textContent = error(e);
      } finally { button.disabled = false; }
    }
    async function enter(){
      var attempt=++availabilityVersion;
      await TL.api.ready;
      if(attempt!==availabilityVersion)return;
      if(saved && saved.base !== TL.api.base){ saved = null; reset(); }
      var available=false;
      try { if(TL.api.online) available = !!(await call("GET","/account/status")).enabled; } catch(e){}
      if(attempt!==availabilityVersion)return;
      enabled=available;
      if(!enabled)reset();
      $("#accountSend").disabled = !enabled;
      $("#accountEmailForm").hidden = !enabled || !!challenge;
      $('#accountUnavailable').hidden=enabled;
      $("#accountGuestTitle").textContent = enabled ? "Create an account or sign in" : "Online accounts are coming soon";
      $("#accountGuestIntro").textContent = enabled ? "New and returning customers use the same email code. No Google login or password needed. Your code expires in 10 minutes." : "Your store credit is still handled by the shop. Online access will use a verified email address, with no Google login required.";
      if(token){ await refresh(); return; }
      status.textContent = enabled ? "Use the email the shop has on your credit record. New here? You can sign in, then ask the counter to link your credit." : "Call (513) 222-2573 or stop by 2514 Hazelwood Drive.";
    }
    $("#accountEmailForm").addEventListener("submit", async function(e){
      e.preventDefault(); if(!enabled) return;
      var button = $("#accountSend"); if(button.disabled) return;
      button.disabled = true; status.textContent = "Sending your private sign-in code…";
      try {
        var data = await call("POST","/account/code", {email:$("#accountEmail").value.trim()});
        challenge = data.challenge; $("#accountEmailForm").hidden = true; $("#accountCodeForm").hidden = false;
        $("#accountCode").value = ""; $("#accountCode").focus(); status.textContent = "Check your email and paste the full code. It expires in 10 minutes.";
      } catch(err){ status.textContent = error(err); }
      finally { button.disabled = !enabled; }
    });
    $("#accountCodeForm").addEventListener("submit", async function(e){
      e.preventDefault(); if(!challenge) return;
      var button = $("#accountVerify"); if(button.disabled) return;
      button.disabled = true; status.textContent = "Verifying your code…";
      try {
        var data = await call("POST","/account/verify", {challenge:challenge, code:$("#accountCode").value.trim()});
        token = data.token; generation++; data.base = TL.api.base; saved = data; TL.session.set("customer-session",data); challenge = null;
        $("#accountCode").value = ""; $("#accountCodeForm").hidden = true; $("#accountEmailForm").hidden = false;
        await refresh(); if(token) $("#accountLogout").focus();
      } catch(err){ status.textContent = error(err); }
      finally { button.disabled = false; }
    });
    $("#accountRestart").addEventListener("click",function(){
      challenge = null; $("#accountCode").value = ""; $("#accountCodeForm").hidden = true; $("#accountEmailForm").hidden = false; $("#accountEmail").focus();
      status.textContent = "Request a fresh code. Only the code from the email for this request will work here.";
    });
    $("#accountRefresh").addEventListener("click",refresh);
    // Re-read published connection settings as well as service availability.
    $('#accountRetry').addEventListener('click',function(){this.disabled=true;window.location.reload();});
    $("#accountLogout").addEventListener("click",async function(){
      var old = token; reset(); status.textContent = "Signing out…";
      try { await call("POST","/account/logout",{},old); status.textContent = "Signed out."; }
      catch(e){ status.textContent = e.status === 401 ? "Signed out." : "Signed out on this tab. Server sign-out could not be confirmed; the session expires within 12 hours."; }
      $("#accountEmail").focus();
    });
    TL.on("view:change",function(d){ if(d.name === "account") enter(); });
    TL.on('api:ready',function(){if(TL.route().name==='account')enter();});
  })();
