export const START_MS = 10 * 60 * 60 * 1000;
export function initialState() {
  return {remainingMs: START_MS, running: false, endAt: null, donationRemainder: 0,
    lastDonationId: null, selected: 'house1', addedMinutes: 0, style: 'relief', donations: [],
    daStatus: 'Не подключён', daConnected: false, pollEnabled: false,
    buildings: [
      {id:'house1',label:'Дом 1',type:'house',x:32,y:32},
      {id:'house2',label:'Дом 2',type:'house',x:65,y:29},
      {id:'house3',label:'Дом 3',type:'house',x:45,y:49},
      {id:'house4',label:'Дом 4',type:'house',x:29,y:66},
      {id:'house5',label:'Дом 5',type:'house',x:67,y:59},
      {id:'bath',label:'Баня',type:'bath',x:53,y:76}
    ]};
}
export function remaining(state, now=Date.now()) {
  return Math.max(0, state.running ? state.endAt-now : state.remainingMs);
}
export function addTime(state, ms, now=Date.now()) {
  state.remainingMs=Math.max(0,remaining(state,now)+ms);
  if(state.running) state.endAt=now+state.remainingMs;
}
export function setRunning(state, running, now=Date.now()) {
  state.remainingMs=remaining(state,now);
  state.running=running;
  state.endAt=running ? now+state.remainingMs : null;
}
export function applyDonation(state, donation, now=Date.now()) {
  const id=Number(donation.id), amount=Number(donation.amount);
  if(!Number.isSafeInteger(id)||id<=0||!Number.isFinite(amount)||amount<=0) return false;
  if(state.lastDonationId!==null && id<=state.lastDonationId) return false;
  state.lastDonationId=id;
  if(donation.currency!=='RUB') {recordDonation(state,donation,0,'other',now);return false;}
  const total=state.donationRemainder+Math.round(amount*100);
  const minutes=Math.floor(total/1000);
  state.donationRemainder=total%1000;
  state.addedMinutes+=minutes;
  addTime(state, minutes*60000, now);
  recordDonation(state,donation,minutes,'real',now);
  return true;
}
export function recordDonation(state, donation, minutes, kind='real', now=Date.now()) {
  state.donations ||= [];
  state.donations.unshift({id:String(donation.id),username:String(donation.username||'Аноним').slice(0,100),
    amount:Number(donation.amount),currency:String(donation.currency||'RUB').slice(0,8),
    addedMinutes:minutes,kind,receivedAt:now,createdAt:donation.created_at||null});
  state.donations=state.donations.slice(0,100);
}
export function publicView(state,now=Date.now()) {
  return {remainingMs:remaining(state,now),running:state.running,serverNow:now,
    selected:state.selected,buildings:state.buildings,style:state.style||'flat',addedMinutes:state.addedMinutes};
}
export function adminView(state,now=Date.now()) {
  return {...state,...publicView(state,now)};
}
export function control(state,b,now=Date.now()) {
  if(b.action==='start')setRunning(state,true,now);
  else if(b.action==='pause')setRunning(state,false,now);
  else if(b.action==='reset'){setRunning(state,false,now);state.remainingMs=START_MS;}
  else if(b.action==='setTime'){
    const seconds=Number(b.seconds);
    if(!Number.isSafeInteger(seconds)||seconds<0||seconds>999*3600+59*60+59)throw Error('Введите время от 00:00:00 до 999:59:59');
    state.remainingMs=seconds*1000;if(state.running)state.endAt=now+state.remainingMs;
  }
  else if(b.action==='add'){
    const minutes=Number(b.minutes);if(!Number.isFinite(minutes)||Math.abs(minutes)>10080)throw Error('Недопустимое число минут');addTime(state,minutes*60000,now);
  }
  else if(b.action==='testDonation'){
    const amount=Number(b.amount);if(!Number.isFinite(amount)||amount<=0||amount>1000000)throw Error('Введите положительную сумму');
    const minutes=Math.floor(Math.round(amount*100)/1000);addTime(state,minutes*60000,now);
    recordDonation(state,{id:'test-'+now,amount,currency:'RUB',username:'Тестовый донат'},minutes,'test',now);
  }
  else if(b.action==='select'){
    if(!state.buildings.some(x=>x.id===b.id))throw Error('Неизвестная отметка');state.selected=b.id;
  }
  else if(b.action==='move'){
    const item=state.buildings.find(x=>x.id===b.id),x=Number(b.x),y=Number(b.y);
    if(!item||!Number.isFinite(x)||!Number.isFinite(y)||Math.hypot(x-50,y-50)>35)throw Error('Разместите здание в центральном круге карты');item.x=x;item.y=y;
  }
  else if(b.action==='style'){
    if(!['flat','relief'].includes(b.style))throw Error('Неизвестный стиль');state.style=b.style;
  }
  else if(b.action==='poll')state.pollEnabled=Boolean(b.enabled);
  else throw Error('Неизвестное действие');
}
