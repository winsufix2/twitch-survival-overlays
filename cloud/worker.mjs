import {DurableObject} from 'cloudflare:workers';
import {initialState,publicView,adminView,control} from '../engine.mjs';
import {collectDonations,applyBatch} from '../donationalerts.mjs';
import {authorized,originAllowed} from '../security.mjs';
import {authorizationUrl,returnAddress,validChallenge,tokenRequest,DONATION_SCOPE} from '../oauth.mjs';

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
      this.oauthApp=await ctx.storage.get('oauthApp');this.oauthTokens=await ctx.storage.get('oauthTokens');
    });
  }
  async locked(task){const next=this.queue.then(task);this.queue=next.catch(()=>{});return next;}
  async save(){await this.ctx.storage.put('state',this.state);}
  admin(){return {...adminView(this.state),oauthReady:Boolean(this.oauthApp)};}
  async saveTokens(tokens){
    this.token=tokens.accessToken;this.oauthTokens={refreshToken:tokens.refreshToken,expiresAt:tokens.expiresAt};
    await this.ctx.storage.put('donationToken',this.token);await this.ctx.storage.put('oauthTokens',this.oauthTokens);
  }
  async refreshToken(){
    if(!this.oauthApp||!this.oauthTokens?.refreshToken)return false;
    const tokens=await tokenRequest(this.oauthApp,{grant_type:'refresh_token',refresh_token:this.oauthTokens.refreshToken,scope:DONATION_SCOPE});
    tokens.refreshToken ||= this.oauthTokens.refreshToken;await this.saveTokens(tokens);return true;
  }
  async schedule(){if(this.state.pollEnabled&&this.token)await this.ctx.storage.setAlarm(Date.now()+5000);}
  async fetch(request){
    const url=new URL(request.url);
    try{
      if(request.method==='GET'&&url.pathname==='/api/state')return json(publicView(this.state));
      // /api/wake is harmless if invoked publicly: it only restores a missing alarm.
      if(url.pathname==='/api/wake'){if(!await this.ctx.storage.getAlarm())await this.schedule();return json({ok:true});}
      if(request.method==='GET'&&url.pathname==='/api/donation/callback'){
        return await this.locked(async()=>{
          const challenge=await this.ctx.storage.get('oauthChallenge');
          if(!validChallenge(challenge,url.searchParams.get('state')))return json({error:'Ссылка входа истекла. Начните подключение из админ-панели заново.'},400);
          await this.ctx.storage.delete('oauthChallenge');
          const returnTo=new URL(challenge.returnTo);
          try{
            if(url.searchParams.has('error'))throw Error('Подключение DonationAlerts отменено');
            const code=url.searchParams.get('code');if(!code)throw Error('DonationAlerts не вернул код входа');
            const tokens=await tokenRequest(this.oauthApp,{grant_type:'authorization_code',redirect_uri:challenge.callback,code});
            const batch=await collectDonations(this.state,tokens.accessToken);
            await this.saveTokens(tokens);this.state.pollEnabled=true;applyBatch(this.state,batch);returnTo.searchParams.set('donation','connected');
          }catch(e){this.state.daStatus=e.message;returnTo.searchParams.set('donation','error');}
          await this.save();await this.schedule();return Response.redirect(returnTo.href,303);
        });
      }
      if(!authorized(request,this.env.ADMIN_KEY))return json({error:this.env.ADMIN_KEY?'Неверный ключ администратора':'Сначала настройте ADMIN_KEY в Cloudflare'},401);
      if(request.method==='GET'&&url.pathname==='/api/admin')return json(this.admin());
      if(request.method==='POST'&&url.pathname==='/api/donation/start'){
        if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Ожидается JSON'},415);
        const raw=await request.text();if(raw.length>4096)return json({error:'Слишком большой запрос'},413);
        const b=JSON.parse(raw);
        return await this.locked(async()=>{
          if(!this.oauthApp)throw Error('Сначала зарегистрируйте приложение DonationAlerts');
          const challenge={state:crypto.randomUUID()+crypto.randomUUID(),expiresAt:Date.now()+600000,callback:url.origin+'/api/donation/callback',returnTo:returnAddress(b.returnTo,url,this.env.ALLOWED_ORIGINS)};
          await this.ctx.storage.put('oauthChallenge',challenge);return json({url:authorizationUrl(this.oauthApp,challenge.callback,challenge.state)});
        });
      }
      if(request.method==='POST'&&url.pathname==='/api/control'){
        if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Ожидается JSON'},415);
        const raw=await request.text();if(raw.length>16384)return json({error:'Слишком большой запрос'},413);
        const b=JSON.parse(raw);
        return await this.locked(async()=>{
          if(b.action==='configureOAuth'){
            const clientId=String(b.clientId||'').trim(),clientSecret=String(b.clientSecret||'').trim();
            if(!/^\d{1,20}$/.test(clientId)||clientSecret.length<8||clientSecret.length>512)throw Error('Введите Client ID и Client Secret из приложения DonationAlerts');
            if(this.token)throw Error('Сначала отключите DonationAlerts, чтобы заменить приложение');
            this.oauthApp={clientId,clientSecret};await this.ctx.storage.put('oauthApp',this.oauthApp);
          }else if(b.action==='connectDonation'){
            const token=String(b.token||'').trim();if(token.length<10||token.length>4096)throw Error('Введите OAuth access token DonationAlerts');
            // Check credentials before replacing a working connection. Never return the token.
            const batch=await collectDonations(this.state,token);
            this.token=token;await this.ctx.storage.put('donationToken',token);
            this.oauthTokens=null;await this.ctx.storage.delete('oauthTokens');
            this.state.pollEnabled=true;applyBatch(this.state,batch);
          }else if(b.action==='disconnectDonation'){
            this.token='';await this.ctx.storage.delete('donationToken');
            this.oauthTokens=null;await this.ctx.storage.delete('oauthTokens');
            this.state.pollEnabled=false;this.state.daConnected=false;this.state.daStatus='Отключён';await this.ctx.storage.deleteAlarm();
          }else control(this.state,b);
          await this.save();await this.schedule();return json(this.admin());
        });
      }
      return json({error:'Not found'},404);
    }catch(e){return json({error:e.message},400);}
  }
  async alarm(){
    await this.locked(async()=>{
      if(!this.state.pollEnabled||!this.token)return;
      try{
        if(this.oauthTokens?.expiresAt&&this.oauthTokens.expiresAt<Date.now()+60000)await this.refreshToken();
        let batch;
        try{batch=await collectDonations(this.state,this.token);}catch(e){if(e.status!==401||!await this.refreshToken())throw e;batch=await collectDonations(this.state,this.token);}
        applyBatch(this.state,batch);
      }
      catch(e){this.state.daConnected=false;this.state.daStatus=e.message;}
      await this.save();await this.schedule();
    });
  }
}
