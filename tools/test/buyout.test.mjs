import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {photoLinks} from '../../api/src/lib/photo-links.js';
import {emailFor} from '../../api/src/routes/forms.js';
import {validateOwnerSettings} from '../../api/src/routes/config.js';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const context={TL:{},$:()=>null,URL};
vm.runInNewContext(read('src/js/41-buyout.js'),context);

test('photo links use identical client/server allowlists and reject scripts, local hosts and lookalikes',()=>{
  const client=context.TL.buyout.photoLinks;
  for(const value of ['', 'https://photos.app.goo.gl/cards', 'https://drive.google.com/file/d/example/view\nhttps://imgur.com/a/cards', 'https://www.dropbox.com/s/example?dl=0']) {
    assert.deepEqual(Array.from(client(value)),photoLinks(value));
  }
  for(const value of ['javascript:alert(1)','data:image/svg+xml,test','http://imgur.com/a/x','https://127.0.0.1/x','https://localhost/x','https://photos.google.com.evil.test/x','https://user:secret@imgur.com/x','https://imgur.com:8443/x','https://imgur.com/x%0aevil','https://imgur.com/a b','https://imgur.com/'+'a'.repeat(500),Array(6).fill('https://imgur.com/x').join('\n'),[]]){
    assert.throws(()=>photoLinks(value));assert.throws(()=>client(value));
  }
});
test('buyout emails preserve photo links, collection details, and verified-format reply address',()=>{
  const f={name:'QA',contact:'qa@example.com',email:'qa@example.com',games:'Pokemon',desc:'Two binders',photoLinks:['https://imgur.com/a/cards']};
  const mail=emailFor('buylist',f);
  assert.equal(mail.replyTo,f.email);assert.match(mail.subject,/quote request/);assert.ok(mail.text.includes(f.photoLinks[0]));assert.ok(mail.text.includes(f.desc));
  assert.doesNotMatch(read('src/js/41-buyout.js'),/localStorage|\.store\.(set|get)|new Image|fetch\(/);
  assert.match(read('src/js/41-buyout.js'),/if\(!TL.api.online\)return/);
  assert.match(read('src/html/14-buylist.html'),/attach JPG, PNG or WebP photos in your email app/);
});
test('confirmed October show keeps its revised table arrangement unassigned pending organizer confirmation',()=>{
  const config=JSON.parse(read('config.default.json'));
  assert.equal(config.show.date,'2026-10-03');
  const ballroom=config.show.floorplan.booths.filter(b=>/^t\d+$/.test(b.id));
  assert.equal(ballroom.length,91);
  assert.ok(ballroom.every(b=>b.type==='unassigned'));
  assert.equal(ballroom[0].label,'T1');
  assert.equal(ballroom.at(-1).label,'T91');
  assert.doesNotThrow(()=>validateOwnerSettings(config));
  const c={TL:{on(){}}};vm.runInNewContext(read('src/js/56-floorplan.js'),c);
  assert.equal(c.TL.floorplan.stats(config.show.floorplan.booths).total,0);
  assert.doesNotMatch(read('src/html/12-show.html'),/<details class="venue-reference-details"/);
});
