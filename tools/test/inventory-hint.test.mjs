import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {sendInventoryHint} from '../send-inventory-hint.mjs';
test('trusted bridge helper signs minimal hints without leaking secrets or following redirects',async t=>{
  const secret='test-shared-secret-'.repeat(3);let calls=0;
  t.mock.method(globalThis,'fetch',async(url,init)=>{
    calls++;assert.equal(url,'https://api.shop.test/inventory/notifications/tcgplayer');assert.equal(init.redirect,'error');
    const h=init.headers;
    assert.equal(h['x-tl-signature'],createHmac('sha256',secret).update(h['x-tl-timestamp']+'.'+h['x-tl-event-id']+'.'+init.body).digest('hex'));
    assert.equal(init.body,'{"type":"order-notification","productIds":["123"]}');
    return Response.json({accepted:true,duplicate:false});
  });
  const config={apiBase:'https://api.shop.test',secret,eventId:'opaque_123',productIds:['123','123']};
  assert.deepEqual(await sendInventoryHint(config),{accepted:true,duplicate:false});assert.equal(calls,1);
  for(const change of [{secret:'short'},{apiBase:'http://api.shop.test'},{apiBase:'https://user:pass@api.shop.test'},{eventId:'customer@example.com'},{productIds:['https://other.test']}])await assert.rejects(sendInventoryHint({...config,...change}));
  assert.equal(calls,1);
});
