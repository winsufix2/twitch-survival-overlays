import {applyDonation,recordDonation} from './engine.mjs';
export async function collectDonations(state,token,fetcher=fetch) {
  async function request(page){
    const r=await fetcher(`https://www.donationalerts.com/api/v1/alerts/donations?page=${page}`,{
      headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!r.ok){const error=new Error(r.status===401?'Авторизация DonationAlerts истекла — обновите токен':`Ошибка DonationAlerts (${r.status})`);error.status=r.status;throw error;}
    const data=await r.json();if(!Array.isArray(data.data))throw Error('Неожиданный ответ DonationAlerts');return data;
  }
  const first=await request(1);
  const valid=items=>items.filter(x=>Number.isSafeInteger(Number(x.id))&&Number(x.id)>0&&Number.isFinite(Number(x.amount))&&Number(x.amount)>0);
  if(state.lastDonationId===null){
    return {baseline:true,items:valid(first.data)};
  }
  let current=first,page=1;const fresh=[];
  while(true){
    fresh.push(...valid(current.data).filter(x=>Number(x.id)>state.lastDonationId));
    if(current.data.some(x=>Number(x.id)<=state.lastDonationId)||!current.links?.next)break;
    if(++page>100)throw Error('Более 3000 новых донатов — история требует проверки');
    current=await request(page);
  }
  return {baseline:false,items:fresh};
}
export function applyBatch(state,batch,now=Date.now()) {
  if(batch.baseline&&state.lastDonationId===null){
    state.lastDonationId=Math.max(0,...batch.items.map(x=>Number(x.id)));
    for(const item of [...batch.items].sort((a,b)=>Number(a.id)-Number(b.id)))recordDonation(state,item,0,'before',now);
  }else for(const item of [...batch.items].sort((a,b)=>Number(a.id)-Number(b.id)))applyDonation(state,item,now);
  state.daConnected=true;state.daStatus='Подключён · проверка каждые 5 секунд';state.lastPollAt=now;
}
