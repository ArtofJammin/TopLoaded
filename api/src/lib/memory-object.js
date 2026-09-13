// Development/test adapter for the Durable Object storage subset used by claims.
export function memoryObject(ObjectClass,env,{alarms=false}={}){
  let committed=new Map(),tail=Promise.resolve();
  let timer=null,running=false,object;
  function arm(){
    if(!alarms||running)return;
    clearTimeout(timer); const at=committed.get('__alarm');
    if(at) {timer=setTimeout(async()=>{running=true;try{await object.alarm();}catch(e){console.error('[local alarm]',e.message);committed.set('__alarm',Date.now()+60000);}finally{running=false;arm();}},Math.max(1,at-Date.now()));timer.unref();}
  }
  const adapter=map=>({get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v)),
    setAlarm:async at=>map.set('__alarm',Number(at)),deleteAlarm:async()=>map.delete('__alarm'),getAlarm:async()=>map.get('__alarm')||null});
  const storage={get:async k=>structuredClone(committed.get(k)),transaction(fn){
    const next=tail.then(async()=>{const work=structuredClone(committed),value=await fn(adapter(work));committed=work;arm();return value;});
    tail=next.catch(()=>{});return next;
  }};
  object=new ObjectClass({storage},env);
  return {idFromName:()=> 'local',get:()=>object};
}
