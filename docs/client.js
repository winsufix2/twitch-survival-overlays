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
  let stopped=false,timer;
  async function poll(){
    try{
      const key=admin?sessionStorage.getItem('survival-admin-key:'+backend())||'':'';
      if(admin&&!key)return;
      receive(await request(admin?'/api/admin':'/api/state',{key}));
    }catch(e){onError(e);}
    finally{if(!stopped)timer=setTimeout(poll,admin?6000:3000);}
  }
  poll();return ()=>{stopped=true;clearTimeout(timer);};
}
