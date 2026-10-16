import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/client.js',import.meta.url),'utf8').split('export function subscribe')[1];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(admin=false){
  const calls=[],received=[],sockets=[],timeouts=[],intervals=[];
  let response={revision:1,remainingMs:1000};
  class Socket{
    static OPEN=1;static CONNECTING=0;
    constructor(url){this.url=String(url);this.readyState=0;sockets.push(this);}
    open(){this.readyState=1;this.onopen();}
    message(state){this.onmessage({data:JSON.stringify({type:'state',state})});}
    send(){}close(){this.readyState=3;this.onclose?.();}
  }
  const context=vm.createContext({URL,WebSocket:Socket,performance,
    backend:()=> 'https://stream.test',sessionStorage:{getItem:()=> 'private-admin-key'},
    request:async(endpoint,options)=>{calls.push({endpoint,options});return response;},
    window:{addEventListener(){},removeEventListener(){}},document:{addEventListener(){},removeEventListener(){}},
    setTimeout:f=>(timeouts.push(f),timeouts.length),clearTimeout(){},
    setInterval:f=>(intervals.push(f),intervals.length),clearInterval(){}
  });
  const subscribe=vm.runInContext('(function subscribe'+code+')',context);
  const stop=subscribe(s=>received.push(s),e=>{throw e;},admin);
  return {calls,received,sockets,timeouts,intervals,stop,setResponse:s=>{response=s;}};
}
test('Live updates arrive without a polling interval and older HTTP responses cannot roll them back',async()=>{
  const h=harness();h.sockets[0].open();h.sockets[0].message({revision:2,remainingMs:4321000});
  await settle();assert.equal(h.received.length,1);assert.equal(h.received[0].remainingMs,4321000);
  assert.equal(h.sockets[0].url,'wss://stream.test/api/live');
  h.stop();h.sockets[0].message({revision:3});assert.equal(h.received.length,1);
});
test('Admin fetches private history with authentication when the public event arrives',async()=>{
  const h=harness(true);await settle();h.sockets[0].open();
  h.setResponse({revision:2,donations:[{id:123}]});h.sockets[0].message({revision:2});
  await settle();assert.equal(h.received.at(-1).donations[0].id,123);
  assert.ok(h.calls.every(c=>c.endpoint==='/api/admin'&&c.options.key==='private-admin-key'));
  assert.ok(!h.sockets[0].url.includes('private-admin-key'));h.stop();
});
test('Lost connections use HTTP fallback and reconnect automatically',async()=>{
  const h=harness();await settle();h.sockets[0].open();h.sockets[0].close();
  assert.equal(h.timeouts.length,1);h.timeouts[0]();assert.equal(h.sockets.length,2);
  const before=h.calls.length;h.intervals[0]();await settle();assert.ok(h.calls.length>before);h.stop();
});
