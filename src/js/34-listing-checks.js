  /* Shared 15-minute observations, never authoritative stock or proof of a sale.
     Only opening a quick view checks now. An outbound click schedules a later
     server check and NEVER blocks navigation. No browsing trail is persisted. */
  (function(){
    var panel=$("#qvListingCheck"), label=$("#qvListingStatus"), retry=$("#qvListingRetry");
    if(!panel)return;
    var current=null, seq=0, timer=null, observations=new Map(), interests=new Map(), pending=new Map(), polls=0;
    function idOf(item){var id=String(item && (item.tcgId || item.id) || "").replace(/^tcg-/,"");return /^[1-9]\d{0,11}$/.test(id)?id:null;}
    function enabled(){return TL.api && TL.api.online && TL.api.integrations && TL.api.integrations.listingChecks;}
    function remember(map,id,value){map.delete(id);map.set(id,value);if(map.size>80)map.delete(map.keys().next().value);}
    function stop(){clearTimeout(timer);timer=null;}
    function show(data){
      stop(); if(!current)return;
      var fresh=data && Number(data.expiresAt)>Date.now(), state=fresh?data.status:"unknown";
      panel.dataset.state=state;
      var checked=data && data.checkedAt?new Date(data.checkedAt).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"";
      label.textContent=state==="listed"?"Listed by our seller · checked "+checked:
        state==="not-listed"?"No active listing returned for our seller · checked "+checked+". Please confirm with the shop.":
        data && data.reason==="checking"?"Checking the seller listing…":
        "Availability unconfirmed · confirm current stock on TCGplayer.";
      retry.hidden=!enabled() || fresh || (data && data.reason==="checking");
      var retryAt=Number(data && data.retryAt)||0;
      retry.disabled=retryAt>Date.now();
      if(document.hidden)return;
      if(fresh){timer=setTimeout(function(){check();},Math.max(1000,data.expiresAt-Date.now()+100));}
      else if(data && data.reason==="checking" && polls++<2){timer=setTimeout(function(){check(true);},Math.max(5000,retryAt-Date.now()));}
      else if(retryAt>Date.now()){timer=setTimeout(function(){retry.disabled=false;retry.hidden=!enabled();},retryAt-Date.now());}
    }
    function check(force){
      if(!current || document.hidden)return;
      var id=current, version=seq, cached=observations.get(id);
      if(!enabled()){show(null);return;}
      if(!force && cached && (cached.expiresAt>Date.now() || cached.retryAt>Date.now())){show(cached);return;}
      stop();label.textContent="Checking the seller listing…";retry.hidden=true;
      // Sharing in-flight work also handles rapid prev/next/back navigation.
      var promise=pending.get(id);
      if(!promise){
        promise=TL.api.get("/inventory/listing/"+id,{noAuth:true,timeout:30000}).catch(function(){return {status:"unknown",retryAt:Date.now()+60000};});
        pending.set(id,promise);
      }
      promise.then(function(data){
        if(pending.get(id)===promise)pending.delete(id);
        remember(observations,id,data);
        if(version===seq && current===id)show(data);
      });
    }
    TL.on("quickview:item",function(item){
      seq++;stop();polls=0;current=idOf(item);panel.hidden=!current;
      if(current)check();
    });
    TL.on("quickview:close",function(){seq++;current=null;stop();});
    TL.on("api:ready",function(){if(current)check();});
    retry.addEventListener("click",function(){if(!retry.disabled){polls=0;check(true);}});
    document.addEventListener("visibilitychange",function(){if(document.hidden)stop();else if(current)check();});
    function interest(e){
      if(e.defaultPrevented || (e.type==="auxclick" && e.button!==1) || !enabled())return;
      var link=e.target.closest && e.target.closest("a[href]");if(!link)return;
      var url;try{url=new URL(link.href);}catch(err){return;}
      if(url.protocol!=="https:" || url.hostname!=="www.tcgplayer.com" || url.searchParams.get("seller")!=="5c356cdf")return;
      var match=/^\/product\/([1-9]\d{0,11})(?:\/|$)/.exec(url.pathname);if(!match)return;
      var id=match[1];if((interests.get(id)||0)>Date.now())return;
      remember(interests,id,Date.now()+15*60000);
      TL.api.post("/inventory/listing/"+id+"/interest",{},{noAuth:true,keepalive:true,timeout:20000}).catch(function(){interests.delete(id);});
    }
    document.addEventListener("click",interest);
    document.addEventListener("auxclick",interest);
  })();
