import {test} from 'node:test';
import assert from 'node:assert/strict';
import {donationTime,donationAmount} from '../public/donation-display.js';

test('Imported history shows individual DA dates instead of the shared import time',()=>{
  const first = donationTime({kind:'before',createdAt:'2026-10-09 14:20:07',receivedAt:1791907359292});
  const second = donationTime({kind:'before',createdAt:'2026-10-06 10:58:54',receivedAt:1791907359292});
  assert.equal(first.text,'09.10.2026 14:20:07');
  assert.equal(second.text,'06.10.2026 10:58:54');
});
test('Missing or invalid DA dates never masquerade as the import time',()=>{
  for(const createdAt of [null,'invalid','2026-02-30 10:00:00'])
    assert.equal(donationTime({kind:'before',createdAt,receivedAt:1791907359292}).text,'Не указано');
  assert.match(donationTime({kind:'test',receivedAt:1791907359292}).text,/2026/);
  assert.match(donationTime({createdAt:'2026-10-09T14:20:07Z'}).text,/17:20:07/);
});
test('Amounts retain DA values and currency without conversion',()=>{
  assert.equal(donationAmount({amount:33,currency:'RUB'}),'33 ₽');
  assert.equal(donationAmount({amount:33.75,currency:'RUB'}),'33,75 ₽');
  assert.equal(donationAmount({amount:6,currency:'EUR'}),'6 EUR');
});
