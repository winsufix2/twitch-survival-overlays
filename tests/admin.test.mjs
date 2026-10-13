import {test} from 'node:test';import assert from 'node:assert/strict';
import {initialState,remaining,control,publicView,adminView,applyDonation} from '../engine.mjs';
import {collectDonations,applyBatch} from '../donationalerts.mjs';
import {authorized,originAllowed} from '../security.mjs';
test('Custom time works while paused and running; invalid time is rejected',()=>{
  const s=initialState();control(s,{action:'setTime',seconds:3661},1000);assert.equal(remaining(s,10000),3661000);
  control(s,{action:'start'},10000);control(s,{action:'setTime',seconds:600},12000);assert.equal(remaining(s,13000),599000);
  assert.throws(()=>control(s,{action:'setTime',seconds:-1}));assert.throws(()=>control(s,{action:'setTime',seconds:1.1}));
});
test('History records credited minutes, accumulation, tests, and ignored currencies',()=>{
  const s=initialState();applyDonation(s,{id:1,amount:15,currency:'RUB',username:'A'});
  applyDonation(s,{id:2,amount:5,currency:'RUB',username:'B'});applyDonation(s,{id:3,amount:5,currency:'USD'});
  control(s,{action:'testDonation',amount:100},5000);assert.equal(s.donations[0].kind,'test');assert.equal(s.donations[0].addedMinutes,10);
  assert.equal(s.lastDonationId,3);assert.equal(s.donations[1].addedMinutes,0);assert.equal(s.donations[2].addedMinutes,1);
  assert.equal(s.addedMinutes,2);assert.equal(s.donationRemainder,0);
});
test('Public widgets cannot read donor history or status; admin can',()=>{
  const s=initialState();control(s,{action:'testDonation',amount:10});
  const pub=publicView(s);assert.equal('donations' in pub,false);assert.equal('lastDonationId' in pub,false);assert.equal('daStatus' in pub,false);
  assert.equal(adminView(s).donations.length,1);
});
test('Initial connection shows past donations but does not credit them; new replay ignored',async()=>{
  const s=initialState();const fetcher=async()=>Response.json({data:[{id:12,amount:100,currency:'RUB'},{id:11,amount:50,currency:'RUB'}],links:{next:null}});
  applyBatch(s,await collectDonations(s,'token',fetcher));assert.equal(s.addedMinutes,0);assert.equal(s.lastDonationId,12);assert.equal(s.donations[0].kind,'before');
  const batch={baseline:false,items:[{id:13,amount:20,currency:'RUB'},{id:13,amount:20,currency:'RUB'}]};applyBatch(s,batch);assert.equal(s.addedMinutes,2);
});
test('Polling fetches all pages, applies chronological amounts, and retains cursor on failure',async()=>{
  const s=initialState();s.lastDonationId=1;
  const fetcher=async url=>Response.json(url.endsWith('=1')?{data:[{id:3,amount:5,currency:'RUB'}],links:{next:'page2'}}:{data:[{id:2,amount:5,currency:'RUB'},{id:1,amount:10,currency:'RUB'}],links:{next:null}});
  applyBatch(s,await collectDonations(s,'token',fetcher));assert.equal(s.lastDonationId,3);assert.equal(s.addedMinutes,1);
  await assert.rejects(()=>collectDonations(s,'token',async()=>new Response('',{status:401})));assert.equal(s.lastDonationId,3);
});
test('Admin authentication is required; only allowed origins pass',()=>{
  const key='abcdefghijklmnopqrstuvwxyz';const req=value=>new Request('https://app.test/api/admin',{headers:{Authorization:value}});
  assert.equal(authorized(req('Bearer '+key),key),true);assert.equal(authorized(req('Bearer wrong'),key),false);assert.equal(authorized(req(''),''),false);
  assert.equal(originAllowed('https://evil.test','https://app.test'),false);
  assert.equal(originAllowed('https://winsufix2.github.io','https://app.test','https://winsufix2.github.io'),true);
});
test('Style rollback and positions are validated; history is bounded',()=>{
  const s=initialState();control(s,{action:'style',style:'flat'});assert.equal(s.style,'flat');control(s,{action:'select',id:'bath'});assert.equal(s.selected,'bath');
  assert.throws(()=>control(s,{action:'move',id:'bath',x:100,y:0}));for(let i=0;i<110;i++)control(s,{action:'testDonation',amount:10},i);assert.equal(s.donations.length,100);
});
