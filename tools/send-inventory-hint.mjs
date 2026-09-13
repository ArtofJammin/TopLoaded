#!/usr/bin/env node
// Adapter for an OWNER-APPROVED, authenticated mailbox rule. Does not read mail.
// Only invoke AFTER the bridge verifies TCGplayer sender authenticity. A From:
// string/subject alone is insufficient. Never forward the customer's email body.
import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { publicApiConfig } from './site-api-config.mjs';

export async function sendInventoryHint({apiBase,secret,eventId,productIds=[]}) {
  const base=publicApiConfig(apiBase).apiBase;
  if(!base || typeof secret!=='string' || secret.length<32)throw new Error('Configure the HTTPS API base and a strong shared secret in the protected bridge runtime.');
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(eventId||'') || !Array.isArray(productIds) || productIds.length>20 || !productIds.every(id=>typeof id==='string' && /^[1-9]\d{0,11}$/.test(id)))throw new Error('Use an opaque event ID and at most twenty numeric product IDs.');
  const raw=JSON.stringify({type:'order-notification',productIds:[...new Set(productIds)]});
  const timestamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',secret).update(timestamp+'.'+eventId+'.'+raw).digest('hex');
  const r=await fetch(base+'/inventory/notifications/tcgplayer',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{'content-type':'application/json','x-tl-timestamp':timestamp,'x-tl-event-id':eventId,'x-tl-signature':signature},body:raw});
  if(!r.ok)throw new Error('Inventory hint rejected (HTTP '+r.status+'). Retry with the same event ID after checking configuration.');
  const data=await r.json();return {accepted:data.accepted===true,duplicate:data.duplicate===true};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(!args.includes('--send'))console.log('No request sent. After sender verification, use: node tools/send-inventory-hint.mjs --send OPAQUE_EVENT_ID [PRODUCT_ID ...]. Set TCG_NOTIFICATION_API_BASE and TCG_NOTIFICATION_SECRET securely in the bridge environment; never pass secrets as arguments.');
  else {
    try {
      if(args[0]!=='--send')throw new Error('Put --send before the event ID and optional product IDs.');
      const r=await sendInventoryHint({apiBase:process.env.TCG_NOTIFICATION_API_BASE,secret:process.env.TCG_NOTIFICATION_SECRET,eventId:args[1],productIds:args.slice(2)});
      console.log(r.duplicate?'Notification already accepted.':'Refresh hint accepted; no stock was deducted.');
    }catch(e){console.error(e.message);process.exitCode=1;}
  }
}
