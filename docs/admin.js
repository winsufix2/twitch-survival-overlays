import {backend,widgetUrl,request,subscribe} from './client.js';
const $=id=>document.getElementById(id),keyName=()=> 'survival-admin-key:'+backend();
let state,receivedAt=performance.now(),stop;
function toast(text){$('toast').textContent=text;}
function key(){return sessionStorage.getItem(keyName())||'';}
function links(){for(const type of ['timer','map']){$(type+'-link').href=widgetUrl(type+'.html');$(type+'-preview').src=widgetUrl(type+'.html');}}
links();$('api').value=backend();
$('callback-address').value=backend()+'/api/donation/callback';$('application-site').textContent=backend();
function clock(){if(!state)return;const sec=Math.ceil(Math.max(0,state.remainingMs-(state.running?performance.now()-receivedAt:0))/1000);$('clock').textContent=[Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(x=>String(x).padStart(2,'0')).join(':');}
function receive(s){
  state=s;receivedAt=performance.now();clock();$('running').textContent=s.running?'Отсчёт идёт':'На паузе';$('da').textContent=s.daStatus;$('da').classList.toggle('ok',s.daConnected);
  $('oauth-connect').hidden=!s.oauthReady;$('oauth-setup').hidden=Boolean(s.oauthReady)||['127.0.0.1','localhost'].includes(new URL(backend()).hostname);
  $('total').textContent=s.addedMinutes+' мин';$('remainder').textContent=(s.donationRemainder/100).toLocaleString('ru-RU')+' ₽';
  if(!$('location').options.length){for(const id of ['location','building'])for(const b of s.buildings){const opt=document.createElement('option');opt.value=b.id;opt.textContent=b.label;$(id).append(opt);}fillPosition();}
  $('location').value=s.selected;$('flat').classList.toggle('selected',s.style==='flat');$('relief').classList.toggle('selected',s.style==='relief');$('style-status').textContent=s.style==='flat'?'Включено прежнее плоское оформление':'Включены объёмные надписи с рельефом и тенью';
  const rows=document.createDocumentFragment();
  for(const d of s.donations||[]){
    const row=document.createElement('tr');const when=new Date(d.receivedAt).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    const values=[when,d.username,d.amount.toLocaleString('ru-RU')+' '+(d.currency==='RUB'?'₽':d.currency),'+'+d.addedMinutes+' мин'];
    for(const v of values){const cell=document.createElement('td');cell.textContent=v;row.append(cell);}
    const cell=document.createElement('td'),tag=document.createElement('span');tag.className='tag';tag.textContent={real:'Донат',test:'Тест',before:'До подключения',other:'Другая валюта'}[d.kind]||d.kind;cell.append(tag);row.append(cell);rows.append(row);
  }
  $('donations').replaceChildren(rows);$('empty').hidden=Boolean(s.donations?.length);
}
async function open(){
  try{receive(await request('/api/admin',{key:key()}));$('login').hidden=true;$('panel').hidden=false;$('logout').hidden=false;stop?.();stop=subscribe(receive,e=>toast(e.message),true);toast('Пульт подключён');}
  catch(e){toast(e.message);$('login').hidden=false;$('panel').hidden=true;$('logout').hidden=true;}
}
async function act(data){try{receive(await request('/api/control',{key:key(),data}));toast(data.action==='testDonation'?'Тест добавлен в историю':'Сохранено');}catch(e){toast(e.message);throw e;}}
function action(data){act(data).catch(()=>{});}
$('login-form').onsubmit=e=>{e.preventDefault();sessionStorage.setItem(keyName(),$('key').value.trim());$('key').value='';open();};
$('logout').onclick=()=>{stop?.();sessionStorage.removeItem(keyName());$('login').hidden=false;$('panel').hidden=true;$('logout').hidden=true;state=null;toast('Вы вышли из управления');};
$('save-api').onclick=()=>{try{const u=new URL($('api').value);if(u.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(u.hostname))throw Error('Нужен HTTPS-адрес');const next=new URL(location.href);next.searchParams.set('api',u.origin);location.href=next.href;}catch(e){toast(e.message);}};
document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>action({action:el.dataset.action}));
document.querySelectorAll('[data-minutes]').forEach(el=>el.onclick=()=>action({action:'add',minutes:Number(el.dataset.minutes)}));
$('time-form').onsubmit=e=>{e.preventDefault();const seconds=Number($('hours').value)*3600+Number($('minutes').value)*60+Number($('seconds').value);action({action:'setTime',seconds});};
$('reset').onclick=()=>{if(confirm('Вернуть 10 часов и остановить отсчёт?'))action({action:'reset'});};
$('test-form').onsubmit=e=>{e.preventDefault();action({action:'testDonation',amount:Number($('amount').value)});};
$('flat').onclick=()=>action({action:'style',style:'flat'});$('relief').onclick=()=>action({action:'style',style:'relief'});
$('location').onchange=()=>action({action:'select',id:$('location').value});
function fillPosition(){const b=state.buildings.find(x=>x.id===$('building').value);if(b){$('x').value=b.x;$('y').value=b.y;}}
$('building').onchange=fillPosition;$('move').onclick=()=>action({action:'move',id:$('building').value,x:Number($('x').value),y:Number($('y').value)});
$('donation-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await act({action:'connectDonation',token:$('donation-token').value});$('donation-token').value='';}catch{}finally{b.disabled=false;}};
$('oauth-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await act({action:'configureOAuth',clientId:$('client-id').value,clientSecret:$('client-secret').value});$('client-id').value='';$('client-secret').value='';toast('Приложение сохранено. Нажми «Войти через DonationAlerts».');}catch{}finally{b.disabled=false;}};
$('oauth-connect').onclick=async()=>{try{$('oauth-connect').disabled=true;const result=await request('/api/donation/start',{key:key(),data:{returnTo:location.origin+location.pathname}});const url=new URL(result.url);if(url.origin!=='https://www.donationalerts.com')throw Error('Неверный адрес входа');location.assign(url.href);}catch(e){toast(e.message);$('oauth-connect').disabled=false;}};
$('copy-callback').onclick=async()=>{try{await navigator.clipboard.writeText($('callback-address').value);toast('Redirect URI скопирован');}catch{toast('Скопируй адрес из поля Redirect URI');}};
$('disconnect').onclick=()=>{if(confirm('Отключить автоматическое добавление времени от DonationAlerts?'))action({action:'disconnectDonation'});};
document.querySelectorAll('[data-copy]').forEach(el=>el.onclick=async()=>{try{await navigator.clipboard.writeText($(el.dataset.copy).href);toast('Ссылка скопирована');}catch{toast('Открой ссылку и скопируй адрес из браузера');}});
setInterval(clock,100);if(key())open();
