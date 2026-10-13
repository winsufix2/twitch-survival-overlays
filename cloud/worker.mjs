import {DurableObject} from 'cloudflare:workers';
import {initialState,publicView,adminView,control} from '../engine.mjs';
import {collectDonations,applyBatch} from '../donationalerts.mjs';
import {authorized,originAllowed} from '../security.mjs';

function json(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    const origin=request.headers.get('Origin');
    if(!originAllowed(origin,url,env.ALLOWED_ORIGINS))return json({error:'Этот сайт не разрешён для управления'},403);
    let response;
    if(request.method==='OPTIONS')response=new Response(null,{status:204});
    else response=await env.SURVIVAL.getByName('main').fetch(request);
    const headers=new Headers(response.headers);
    if(origin){headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');}
    headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');
    headers.set('Referrer-Policy','no-referrer');
    return new Response(response.body,{status:response.status,headers});
  },
  async scheduled(_event,env){await env.SURVIVAL.getByName('main').fetch(new Request('https://internal/api/wake'));}
};
export class SurvivalRoom extends DurableObject {
  constructor(ctx,env){
    super(ctx,env);this.ctx=ctx;this.env=env;this.queue=Promise.resolve();
    ctx.blockConcurrencyWhile(async()=>{
      this.state={...initialState(),...await ctx.storage.get('state')};
      this.token=await ctx.storage.get('donationToken')||env.DONATIONALERTS_ACCESS_TOKEN||'';
    });
  }
  async locked(task){const next=this.queue.then(task);this.queue=next.catch(()=>{});return next;}
  async save(){await this.ctx.storage.put('state',this.state);}
  async schedule(){if(this.state.pollEnabled&&this.token)await this.ctx.storage.setAlarm(Date.now()+5000);}
  async fetch(request){
    const url=new URL(request.url);
    try{
      if(request.method==='GET'&&url.pathname==='/api/state')return json(publicView(this.state));
      // /api/wake is harmless if invoked publicly: it only restores a missing alarm.
      if(url.pathname==='/api/wake'){if(!await this.ctx.storage.getAlarm())await this.schedule();return json({ok:true});}
      if(!authorized(request,this.env.ADMIN_KEY))return json({error:this.env.ADMIN_KEY?'Неверный ключ администратора':'Сначала настройте ADMIN_KEY в Cloudflare'},401);
      if(request.method==='GET'&&url.pathname==='/api/admin')return json(adminView(this.state));
      if(request.method==='POST'&&url.pathname==='/api/control'){
        if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Ожидается JSON'},415);
        const raw=await request.text();if(raw.length>16384)return json({error:'Слишком большой запрос'},413);
        const b=JSON.parse(raw);
        return await this.locked(async()=>{
          if(b.action==='connectDonation'){
            const token=String(b.token||'').trim();if(token.length<10||token.length>4096)throw Error('Введите OAuth access token DonationAlerts');
            // Check credentials before replacing a working connection. Never return the token.
            const batch=await collectDonations(this.state,token);
            this.token=token;await this.ctx.storage.put('donationToken',token);
            this.state.pollEnabled=true;applyBatch(this.state,batch);
          }else if(b.action==='disconnectDonation'){
            this.token='';await this.ctx.storage.delete('donationToken');
            this.state.pollEnabled=false;this.state.daConnected=false;this.state.daStatus='Отключён';await this.ctx.storage.deleteAlarm();
          }else control(this.state,b);
          await this.save();await this.schedule();return json(adminView(this.state));
        });
      }
      return json({error:'Not found'},404);
    }catch(e){return json({error:e.message},400);}
  }
  async alarm(){
    await this.locked(async()=>{
      if(!this.state.pollEnabled||!this.token)return;
      try{applyBatch(this.state,await collectDonations(this.state,this.token));}
      catch(e){this.state.daConnected=false;this.state.daStatus=e.message;}
      await this.save();await this.schedule();
    });
  }
}
