import {DEFAULT_BACKEND} from './config.js';
export function backend(){
  const local=['127.0.0.1','localhost'].includes(location.hostname);
  const value=new URLSearchParams(location.search).get('api')||sessionStorage.getItem('survival-api')||(local?location.origin:DEFAULT_BACKEND||location.origin);
  const url=new URL(value);
  if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw Error('Для облака нужна HTTPS-ссылка');
  return url.origin;
}
export function widgetUrl(file){
  const u=new URL(file,location.href);u.search='';u.hash='';
  if(backend()!==location.origin)u.searchParams.set('api',backend());
  return u.href;
}
export async function request(endpoint,{key='',data}={}){
  const headers={};if(key)headers.Authorization='Bearer '+key;
  if(data!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(backend()+endpoint,{method:data===undefined?'GET':'POST',headers,
    body:data===undefined?undefined:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(15000)});
  const result=await r.json();if(!r.ok)throw Error(result.error||'Ошибка подключения');return result;
}
export function subscribe(receive,onError=()=>{},admin=false){
  let stopped=false,socket,retry,heartbeat,pollTimer,loading=false,pending=false,latest=-1,lastMessage=0;
  const key=()=>admin?sessionStorage.getItem('survival-admin-key:'+backend())||'':'';
  function deliver(state){
    if(stopped||(state.revision??0)<latest)return;
    latest=state.revision??0;receive(state);
  }
  async function refresh(){
    if(stopped||(admin&&!key()))return;
    if(loading){pending=true;return;}
    loading=true;
    try{
      deliver(await request(admin?'/api/admin':'/api/state',{key:key()}));
    }catch(e){if(!stopped)onError(e);}
    finally{loading=false;if(pending){pending=false;refresh();}}
  }
  function connect(){
    if(stopped||socket?.readyState===WebSocket.OPEN||socket?.readyState===WebSocket.CONNECTING)return;
    const url=new URL('/api/live',backend());url.protocol=url.protocol==='https:'?'wss:':'ws:';
    try{socket=new WebSocket(url);}
    catch{retry=setTimeout(connect,2000);return;}
    socket.onopen=()=>{lastMessage=performance.now();};
    socket.onmessage=event=>{
      lastMessage=performance.now();
      try{const message=JSON.parse(event.data);if(message.type==='state'&&message.state){if(admin)refresh();else deliver(message.state);}}
      catch{onError(new Error('Некорректное обновление сервера'));}
    };
    socket.onerror=()=>socket?.close();
    socket.onclose=()=>{if(!stopped){refresh();retry=setTimeout(connect,1500);}};
  }
  function resume(){
    if(document.visibilityState==='hidden')return;
    refresh();
    if(socket?.readyState===WebSocket.OPEN)socket.send('sync');else connect();
  }
  refresh();connect();
  // Fall back to HTTP if a streaming browser or network blocks WebSockets.
  pollTimer=setInterval(()=>{if(socket?.readyState!==WebSocket.OPEN)refresh();},2000);
  heartbeat=setInterval(()=>{
    if(socket?.readyState!==WebSocket.OPEN)return;
    if(performance.now()-lastMessage>45000)socket.close();else socket.send('sync');
  },20000);
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return ()=>{
    stopped=true;clearTimeout(retry);clearInterval(heartbeat);clearInterval(pollTimer);
    window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);socket?.close();
  };
}
