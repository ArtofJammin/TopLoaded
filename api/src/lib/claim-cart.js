import {HttpError} from './http.js';
import {sha256hex} from './auth.js';
import {getJSON,putJSON} from './kv.js';
import {claimInternal,claimCheckoutStatus} from './claim-checkout.js';

const TTL=7*86400;
// This grant is a private payment-link capability, never a staff/account token.
// Only its hash is stored. The public claims feed contains neither it nor the URL.
export async function issueClaimCartLink(env,id){
  if(!env.KV)throw new HttpError(503,'Private checkout storage is unavailable');
  let site;try{site=new URL(env.SITE_URL);}catch{throw new HttpError(503,'Configure the public site URL');}
  const local=site.protocol==='http:'&&env.SQUARE_ENV==='sandbox'&&['localhost','127.0.0.1'].includes(site.hostname);
  if((site.protocol!=='https:'&&!local)||site.username||site.password)throw new HttpError(503,'Configure a secure public site URL');
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
  await putJSON(env.KV,'claim-access:'+await sha256hex(token),{claimId:id,expires:Date.now()+TTL*1000},{expirationTtl:TTL});
  site.search='';site.hash='/live?claim='+encodeURIComponent(id)+'&access='+token;
  return site.href;
}
export async function readClaimCart(env,id,token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||!env.KV)throw new HttpError(403,'Reopen the private claim link supplied by the host');
  const grant=await getJSON(env.KV,'claim-access:'+await sha256hex(token));
  if(!grant||grant.claimId!==id||grant.expires<=Date.now())throw new HttpError(403,'This private claim link is invalid or expired. Ask the host for a new link.');
  const c=await claimInternal(env,id),ready=claimCheckoutStatus(env);
  let url=null;
  if(c.status==='claimed'&&ready.ready&&c.checkout?.state==='pending'){
    let u;try{u=new URL(c.checkout.url);}catch{throw new HttpError(502,'Checkout link unavailable');}
    if(u.protocol!=='https:'||u.username||u.password||u.port||!/(^|\.)square\.(link|site)$/.test(u.hostname))throw new HttpError(502,'Unexpected checkout destination');
    url=u.href;
  }
  return {id:c.id,card:c.card,price:c.price,qty:1,status:c.status,fulfillment:c.fulfillment,
    shippingCents:c.checkout?.shippingCents||0,mode:ready.mode,url,
    reason:url?'Pay this confirmed stream claim through Square. Tax is finalized at checkout.':c.status==='claimed'?ready.reason:'This claim is '+c.status+'.'};
}
