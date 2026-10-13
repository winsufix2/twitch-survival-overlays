import {originAllowed} from './security.mjs';
export const DONATION_SCOPE='oauth-donation-index';
export function returnAddress(value,backend,allowed=''){
  const url=new URL(value);
  if(!originAllowed(url.origin,backend,allowed)||!url.pathname.endsWith('/admin.html'))throw Error('Неверный адрес возврата');
  url.search='';url.hash='';return url.href;
}
export function authorizationUrl(app,callback,state){
  const url=new URL('https://www.donationalerts.com/oauth/authorize');
  url.search=new URLSearchParams({client_id:app.clientId,redirect_uri:callback,response_type:'code',scope:DONATION_SCOPE,state}).toString();return url.href;
}
export function validChallenge(challenge,state,now=Date.now()){
  return Boolean(challenge&&state&&challenge.state===state&&challenge.expiresAt>now);
}
export async function tokenRequest(app,values,fetcher=fetch){
  const response=await fetcher('https://www.donationalerts.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({client_id:app.clientId,client_secret:app.clientSecret,...values}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error(`DonationAlerts не выдал токен (${response.status}). Проверьте настройки приложения.`);
  const result=await response.json();
  if(typeof result.access_token!=='string'||result.access_token.length<10)throw Error('DonationAlerts не вернул access token');
  const lifetime=Number(result.expires_in);
  return {accessToken:result.access_token,refreshToken:result.refresh_token||'',expiresAt:Number.isFinite(lifetime)&&lifetime>0?Date.now()+lifetime*1000:null};
}
