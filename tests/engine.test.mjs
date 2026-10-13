import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState,remaining,setRunning,addTime,applyDonation,START_MS} from '../engine.mjs';
test('Starts paused at ten hours; pause and resume retain time',()=>{
  const s=initialState();assert.equal(remaining(s,1000),START_MS);
  setRunning(s,true,1000);assert.equal(remaining(s,6000),START_MS-5000);
  setRunning(s,false,6000);assert.equal(remaining(s,100000),START_MS-5000);
  setRunning(s,true,100000);assert.equal(remaining(s,101000),START_MS-6000);
});
test('10 RUB adds a minute, 100 RUB adds ten; replay ignored',()=>{
  const s=initialState();applyDonation(s,{id:1,amount:'10',currency:'RUB'});
  applyDonation(s,{id:2,amount:100,currency:'RUB'});
  applyDonation(s,{id:2,amount:100,currency:'RUB'});
  assert.equal(remaining(s),START_MS+11*60000);
});
test('RUB leftovers accumulate without loss; foreign currency ignored',()=>{
  const s=initialState();applyDonation(s,{id:1,amount:15,currency:'RUB'});
  assert.equal(s.donationRemainder,500);
  applyDonation(s,{id:2,amount:5,currency:'RUB'});
  assert.equal(s.donationRemainder,0);assert.equal(s.addedMinutes,2);
  applyDonation(s,{id:3,amount:100,currency:'USD'});assert.equal(s.addedMinutes,2);
});
test('Active countdown preserves additions across saved restart; never negative',()=>{
  const s=initialState();setRunning(s,true,1000);addTime(s,60000,2000);
  const restored=JSON.parse(JSON.stringify(s));assert.equal(remaining(restored,3000),START_MS+58000);
  assert.equal(remaining(restored,999999999),0);
});
test('Malformed donation does not advance cursor',()=>{
  const s=initialState();assert.equal(applyDonation(s,{id:1,amount:'NaN',currency:'RUB'}),false);
  assert.equal(s.lastDonationId,null);
});
