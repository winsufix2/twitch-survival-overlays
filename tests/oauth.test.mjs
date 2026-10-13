import {test} from 'node:test';import assert from 'node:assert/strict';
import {authorizationUrl,returnAddress,validChallenge,tokenRequest} from '../oauth.mjs';
test('OAuth requests only donor-list scope and never includes client secret in authorization URL',()=>{
  const url=new URL(authorizationUrl({clientId:'123',clientSecret:'private-secret'},'https://app.test/api/donation/callback','nonce'));
  assert.equal(url.origin,'https://www.donationalerts.com');assert.equal(url.searchParams.get('scope'),'oauth-donation-index');assert.equal(url.searchParams.get('state'),'nonce');assert.equal(url.href.includes('private-secret'),false);
});
test('Callback challenge must match and be unexpired; external return URLs are rejected',()=>{
  const c={state:'nonce',expiresAt:200};assert.equal(validChallenge(c,'nonce',100),true);assert.equal(validChallenge(c,'wrong',100),false);assert.equal(validChallenge(c,'nonce',200),false);
  assert.equal(returnAddress('https://pages.test/widgets/admin.html?key=bad','https://app.test','https://pages.test'),'https://pages.test/widgets/admin.html');
  assert.throws(()=>returnAddress('https://evil.test/admin.html','https://app.test'));assert.throws(()=>returnAddress('https://app.test/other.html','https://app.test'));
});
test('Code exchange and refresh submit server credentials as form body and calculate expiry',async()=>{
  const app={clientId:'123',clientSecret:'private-secret'};let calls=0;
  const fetcher=async(url,options)=>{assert.equal(url,'https://www.donationalerts.com/oauth/token');assert.equal(options.method,'POST');assert.equal(options.body.get('client_secret'),app.clientSecret);assert.equal(options.body.get('grant_type'),calls++?'refresh_token':'authorization_code');return Response.json({access_token:'access-token-value',refresh_token:'refresh-value',expires_in:3600});};
  const t=await tokenRequest(app,{grant_type:'authorization_code',code:'code',redirect_uri:'https://app.test/callback'},fetcher);assert.equal(t.refreshToken,'refresh-value');assert.ok(t.expiresAt>Date.now()+3500000);
  await tokenRequest(app,{grant_type:'refresh_token',refresh_token:t.refreshToken},fetcher);
  await assert.rejects(()=>tokenRequest(app,{},async()=>new Response('',{status:401})),/не выдал токен/);
});
