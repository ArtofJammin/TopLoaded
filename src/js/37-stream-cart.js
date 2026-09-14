  /* Private host-issued claim links enter the Stream group, never the TCGplayer
     checkout. Capabilities live in session storage only; payment URLs and buyer
     access tokens are never written into the persisted cart or public feed. */
  TL.streamCart=(function(){
    var grants=TL.session.get('claim-access',{}),records={},requests={},incoming=null;
    if(!grants||typeof grants!=='object'||Array.isArray(grants))grants={};
    var idPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    function save(){Object.keys(grants).forEach(function(id){if(!idPattern.test(id)||!grants[id]||Date.now()-grants[id].at>7*86400000)delete grants[id];});TL.session.set('claim-access',grants);}
    function access(id){var g=grants[id];return g&&g.base===TL.api.base&&Date.now()-g.at<7*86400000&&/^[a-f0-9]{64}$/.test(g.token)?g.token:null;}
    function safeUrl(value){try{var u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/(^|\.)square\.(link|site)$/.test(u.hostname)?u.href:null;}catch(e){return null;}}
    function notice(text){var el=$('#streamCartNotice');el.textContent=text;el.hidden=!text;}
    function validate(d,id){if(!d||d.id!==id||typeof d.card!=='string'||!isFinite(d.price)||d.price<=0||d.qty!==1||!/^(claimed|paid|shipped|cancelled)$/.test(d.status))throw new Error('The claim details could not be verified.');return d;}
    function apply(d,add){
      var id='stream-claim-'+d.id;
      var snap=cartSnap({id:id,name:d.card,set:'Confirmed live stream claim',price:d.price,stock:1,live:true,claimStatus:d.status});
      if(cart[id]){cart[id]={qty:1,item:snap};cartCommit('sync',{changed:[id]});}
      else if(add)TL.cart.add(snap,1);
    }
    function load(id,add){
      if(requests[id])return requests[id];
      var token=access(id);
      if(!TL.api.online||!token)return Promise.reject(new Error(!TL.api.online?'Stream payments are not connected. Ask the host for help.':'Reopen the private claim link from the host in this browser.'));
      requests[id]=TL.api.post('/live/claims/'+encodeURIComponent(id)+'/payment',{access:token},{noAuth:true}).then(function(data){
        var d=validate(data,id);records[id]={data:d,at:Date.now()};apply(d,add);return d;
      }).catch(function(e){records[id]={error:e.error||e.message||'The payment service could not be reached.',at:Date.now()};TL.cart.render();throw e;}).finally(function(){delete requests[id];});
      return requests[id];
    }
    function action(it){
      if(!it.claimId)return '<span class="ct-payment-note">Host confirmation required. This saved stream item has no verified payment link.</span><button type="button" class="btn btn-ghost" data-cart-live>Contact the stream host</button>';
      var id=it.claimId,r=records[id],d=r&&r.data;
      if(d&&d.status!=='claimed')return '<span class="ct-payment-note">'+esc(d.status==='paid'?'Paid — confirmed by Square':d.status==='shipped'?'Paid and shipped':'Claim cancelled — do not pay')+'</span>';
      if(!TL.api.online)return '<span class="ct-payment-note">Stream payments unavailable. Contact the host; nothing has been charged.</span>';
      if(!access(id))return '<span class="ct-payment-note">Open the host’s private claim link to access payment. This saved item alone does not authorize checkout.</span>';
      if(d&&d.mode==='sandbox'&&TL.production)return '<span class="ct-payment-note">Sandbox checkout only — real payment is not available.</span>';
      if(d&&!d.url)return '<span class="ct-payment-note">'+esc(d.reason||'The host has not activated this checkout.')+'</span><button type="button" class="btn btn-ghost" data-stream-review="'+id+'">Check again</button>';
      var pay=!!(d&&safeUrl(d.url));
      return (r&&r.error?'<span class="ct-payment-note">'+esc(r.error)+'</span>':'')+
        '<button type="button" class="btn" data-stream-'+(pay?'pay':'review')+'="'+id+'">'+(pay?(d.mode==='sandbox'?'Test checkout · no charge':'Pay stream claim ↗'):'Review stream payment')+'</button>'+
        (d?'<span class="ct-payment-note">'+(d.fulfillment==='ship'?'Shipping '+money(d.shippingCents/100):'In-store pickup')+' · tax finalized by Square</span>':'');
    }
    function review(id,pay){
      if(requests[id])return;
      var hadItem=TL.cart.has('stream-claim-'+id);
      load(id,false).then(function(d){
        if(!pay||!hadItem||!TL.cart.has('stream-claim-'+id))return;
        if(d.status!=='claimed'||!d.url){toast('This claim is not awaiting payment.');return;}
        if(TL.production&&d.mode!=='production'){toast('Sandbox link — real payment is not available.');return;}
        var u=safeUrl(d.url);if(!u){toast('Unexpected checkout destination — contact the host.');return;}
        // Never clear the cart or mark paid on click/redirect. Only the signed
        // Square webhook changes the server-side claim status.
        window.location.href=u;
      }).catch(function(e){toast(e.error||e.message||'Could not verify this claim.');});
    }
    function accept(){
      if(!incoming)return;
      var p=incoming;
      if(!TL.api.online){notice('Stream checkout is not connected yet. Keep the host’s private link and reopen it when the shop activates payments.');return;}
      incoming=null;grants[p.id]={token:p.token,base:TL.api.base,at:Date.now()};save();
      load(p.id,true).then(function(){notice('Your confirmed claim is in the Stream purchases section of your cart.');TL.cart.open();}).catch(function(e){notice(e.error||e.message||'This claim could not be opened. Ask the host for a new private link.');});
    }
    function route(d){
      var p=d&&d.params;if(!p||!p.access)return;
      var valid=idPattern.test(p.claim||'')&&/^[a-f0-9]{64}$/.test(p.access);
      if(valid)incoming={id:p.claim,token:p.access};
      var clean=Object.assign({},p);delete clean.access;delete clean.claim;TL.setParams(clean,{replace:true});
      if(!valid){notice('Invalid claim link. Ask the host for a new private link.');return;}
      TL.api.ready.then(accept);
    }
    function refresh(){if(!TL.api.online||document.hidden)return;TL.cart.lines().forEach(function(l){var id=l.item.claimId,r=records[id];if(id&&access(id)&&(!r||Date.now()-r.at>15000))load(id,false).catch(function(){});});}
    TL.on('view:change',route);TL.on('api:ready',function(){accept();refresh();TL.cart.render();});TL.on('cart:open',refresh);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
    document.addEventListener('click',function(e){var b=e.target.closest('[data-stream-pay],[data-stream-review]');if(!b)return;review(b.dataset.streamPay||b.dataset.streamReview,!!b.dataset.streamPay);});
    save();return {action:action,safeUrl:safeUrl,refresh:refresh};
  })();
