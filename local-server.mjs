import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {initialState,publicView,adminView,control} from './engine.mjs';
import {collectDonations,applyBatch} from './donationalerts.mjs';
import {authorized,originAllowed} from './security.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),port=Number(process.env.PORT||8766);
const origin=`http://127.0.0.1:${port}`,privateDir=path.join(root,'private');fs.mkdirSync(privateDir,{recursive:true});
const keyFile=path.join(privateDir,'admin-key.txt');
if(!fs.existsSync(keyFile))fs.writeFileSync(keyFile,crypto.randomBytes(24).toString('hex'));
const key=process.env.ADMIN_KEY||fs.readFileSync(keyFile,'utf8').trim();
const stateFile=path.join(privateDir,'state.json'),tokenFile=path.join(privateDir,'donation-token.txt');
let state={...initialState(),...(fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{})};
let token=process.env.DONATIONALERTS_ACCESS_TOKEN||(fs.existsSync(tokenFile)?fs.readFileSync(tokenFile,'utf8').trim():'');
let queue=Promise.resolve();function locked(task){const next=queue.then(task);queue=next.catch(()=>{});return next;}
function save(){const temp=stateFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(state,null,2));fs.renameSync(temp,stateFile);}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){let s='';for await(const c of req){s+=c;if(s.length>16384)throw Error('Слишком большой запрос');}return JSON.parse(s||'{}');}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ttf':'font/ttf','.woff2':'font/woff2','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,origin);
    if(u.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
    if(u.pathname.startsWith('/api/')){
      if(!originAllowed(req.headers.origin,origin,process.env.ALLOWED_ORIGINS))return json(res,{error:'Недопустимый сайт'},403);
      if(req.headers.origin){res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin');}
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
      if(req.method==='GET'&&u.pathname==='/api/state')return json(res,publicView(state));
      const request={headers:{get:name=>req.headers[name.toLowerCase()]}};
      if(!authorized(request,key))return json(res,{error:'Неверный ключ администратора'},401);
      if(req.method==='GET'&&u.pathname==='/api/admin')return json(res,adminView(state));
      if(req.method==='POST'&&u.pathname==='/api/control'){
        if(!req.headers['content-type']?.startsWith('application/json'))return json(res,{error:'Ожидается JSON'},415);
        const b=await body(req);
        return await locked(async()=>{
          if(b.action==='connectDonation'){
            const next=String(b.token||'').trim();if(next.length<10||next.length>4096)throw Error('Введите OAuth access token');
            const batch=await collectDonations(state,next);token=next;fs.writeFileSync(tokenFile,token);state.pollEnabled=true;applyBatch(state,batch);
          }else if(b.action==='disconnectDonation'){
            token='';if(fs.existsSync(tokenFile))fs.unlinkSync(tokenFile);state.pollEnabled=false;state.daConnected=false;state.daStatus='Отключён';
          }else control(state,b);
          save();return json(res,adminView(state));
        });
      }
      return json(res,{error:'Not found'},404);
    }
    if(req.method!=='GET')return json(res,{error:'Method not allowed'},405);
    const alias={'/':'index.html','/admin':'admin.html','/timer':'timer.html','/map':'map.html','/preview':'preview.html'}[u.pathname];
    const name=alias||decodeURIComponent(u.pathname).slice(1),publicDir=path.join(root,'public');
    if(name.includes('..')||!types[path.extname(name)])return json(res,{error:'Not found'},404);
    const filename=path.resolve(publicDir,name);
    if(!filename.startsWith(publicDir+path.sep)||!fs.existsSync(filename))return json(res,{error:'Not found'},404);
    res.writeHead(200,{'Content-Type':types[path.extname(filename)],'Cache-Control':'no-cache'});fs.createReadStream(filename).pipe(res);
  }catch(e){json(res,{error:e.message},400);}
}).listen(port,'127.0.0.1',()=>console.log(`Виджеты: ${origin}\nАдмин-панель: ${origin}/admin.html\nКлюч входа: private/admin-key.txt`));
async function poll(){
  await locked(async()=>{
    if(!state.pollEnabled||!token)return;
    try{applyBatch(state,await collectDonations(state,token));}catch(e){state.daConnected=false;state.daStatus=e.message;}save();
  });setTimeout(poll,5000).unref();
}
poll();
