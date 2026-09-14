  /* Optional inquiry: API inbox when connected, explicit email draft otherwise.
     No attachments, photo URLs or customer details are cached in browser storage. */
  TL.buyout = (function(){
    function photoLinks(value){
      if(typeof value !== 'string') throw new Error('Enter photo links as text.');
      var links=value.split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
      if(links.length>5) throw new Error('Use up to five photo links, one per line.');
      return links.map(function(s){
        var u;try{u=new URL(s);}catch(e){throw new Error('Use full HTTPS photo or album links.');}
        var hosts=['photos.app.goo.gl','photos.google.com','drive.google.com','imgur.com','www.imgur.com','i.imgur.com','dropbox.com','www.dropbox.com','1drv.ms','onedrive.live.com','icloud.com','www.icloud.com','postimg.cc','i.postimg.cc'];
        if(s.length>500 || /[\s\u0000-\u001f\u007f]/.test(s) || /%0[ad]/i.test(s) || u.protocol!=='https:' || u.username || u.password || u.port || hosts.indexOf(u.hostname)<0)
          throw new Error('Use HTTPS links from Google Photos/Drive, Imgur, Dropbox, OneDrive, iCloud or Postimages (500 characters each).');
        return u.href;
      });
    }
    var form=$('#buyForm');
    if(!form) return {photoLinks:photoLinks};
    var result=$('#buyResult'),status=$('#buyResultStatus'),send=$('#buySubmit'),draft=$('#buyDraftText'),version=0,sentVersion=-1;
    function connection(){
      if(form.getAttribute('aria-busy')==='true')return;
      if(sentVersion===version){send.disabled=true;send.textContent='Inquiry sent';return;}
      send.disabled=false;
      send.textContent=TL.api.online?'Send buyout inquiry →':'Prepare email inquiry →';
      $('#buyDeliveryNote').textContent=TL.api.online?'Send details and photo links privately to the shop. For photo attachments, use the email draft option below. No files are uploaded here.':'Prepare an email to the shop. Attach JPG, PNG or WebP photos in your email app before sending. Nothing is sent by this page.';
    }
    function showDraft(fields,links,message){
      var lines=['Collection buyout inquiry','Name: '+fields.name,'Contact: '+fields.contact,'Games / types: '+fields.games,'',fields.desc,'',links.length?'Photo links:\n'+links.join('\n'):'I can attach photos to this email.'];
      draft.value=lines.join('\n');
      $('#buyEmailDraft').href=TL.forms.mailto('Collection buyout inquiry',lines);
      $('#buyEmailDraft').hidden=false;$('#buyCopy').hidden=false;
      status.textContent=message+' Open the email draft, attach photos if you like, then send it from your email app. If your email app leaves anything out, use Copy inquiry.';
      result.hidden=false;result.focus({preventScroll:true});
    }
    form.addEventListener('input',function(e){
      version++;result.hidden=true;draft.value='';draft.hidden=true;$('#buyEmailDraft').removeAttribute('href');
      if(e.target.getAttribute('aria-invalid'))TL.forms.clearFieldError(e.target);
      connection();
    });
    form.addEventListener('submit',async function(e){
      e.preventDefault();if(send.disabled)return;
      formsClearErrors(form);
      var fields=formsCollect(form),bad=formsValidate(form),links;
      if(fields.website)return;
      if(!bad && (!TL.forms.looksEmail(fields.contact) && !/^\+?[\d\s().-]{7,24}$/.test(fields.contact)))bad={ctrl:$('#buyContact'),msg:'Enter an email or a phone number.'};
      if(!bad && fields.name.length<2)bad={ctrl:$('#buyName'),msg:'Please enter your name.'};
      if(!bad && fields.desc.length<3)bad={ctrl:$('#buyDesc'),msg:'Tell us a little about the collection.'};
      try{links=photoLinks(fields.photosUrl);}catch(err){if(!bad)bad={ctrl:$('#buyPhotos'),msg:err.message};}
      if(bad){TL.forms.setFieldError(bad.ctrl,bad.msg);bad.ctrl.focus();return;}
      fields.photosUrl=links.join('\n');
      showDraft(fields,links,'Your inquiry is ready, but has not been sent.');
      if(!TL.api.online)return;
      var attempt=version;formsSetBusy(form,true);
      try{
        var response=await TL.forms.submit('buylist',fields);
        if(attempt!==version)return;
        sentVersion=attempt;
        status.textContent='Your inquiry is in the shop’s inbox. We’ll use the contact details you provided to follow up. No offer is guaranteed until an in-store review. To send additional photo attachments, open the email draft and mention inquiry '+response.id+'.';
        $('#buyEmailDraft').href=TL.forms.mailto('Photos for buyout inquiry '+response.id,[draft.value]);
      }catch(err){
        if(attempt===version)status.textContent='Your inquiry could not be confirmed. Your answers are still here. You can retry or open the email draft and send it yourself.';
      }finally{formsSetBusy(form,false);delete send.dataset.label;connection();}
    });
    $('#buyCopy').addEventListener('click',async function(){
      try{await navigator.clipboard.writeText(draft.value);toast('Inquiry copied — paste it into your email.');}
      catch(e){draft.hidden=false;draft.focus();draft.select();status.textContent='Copy the text below into an email to the shop. Nothing has been sent.';}
    });
    TL.api.ready.then(connection);TL.on('api:ready',connection);
    return {photoLinks:photoLinks};
  })();
