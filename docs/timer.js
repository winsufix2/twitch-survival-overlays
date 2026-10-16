import {subscribe} from './client.js?v=live-1';
let timerState={remainingMs:36000000,running:false},receivedAt=performance.now(),lastMinutes=null;
function receive(s){
  const override=new URLSearchParams(location.search).get('style');
  document.querySelector('.timer-stage').classList.toggle('relief',(override||s.style)==='relief');
  document.getElementById('offline').hidden=true;
  if(lastMinutes!==null&&s.addedMinutes>lastMinutes){const el=document.querySelector('.timer-stage');el.classList.remove('added');void el.offsetWidth;el.classList.add('added');}
  lastMinutes=s.addedMinutes;timerState=s;receivedAt=performance.now();render();
}
function render(){
  const ms=Math.max(0,timerState.remainingMs-(timerState.running?performance.now()-receivedAt:0));
  const sec=Math.ceil(ms/1000),hours=Math.floor(sec/3600),min=Math.floor(sec%3600/60);
  document.getElementById('digits').textContent=[hours,min,sec%60].map(x=>String(x).padStart(2,'0')).join(':');
}
subscribe(receive,()=>{document.getElementById('offline').hidden=false;});
setInterval(render,100);
