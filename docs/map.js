const house='<svg viewBox="0 0 64 58" aria-hidden="true"><path d="M6 27 31 7 57 27 53 30 53 51 11 51 11 30Z"/><path d="M3 27 31 4 60 27M15 25 31 13 49 27M21 51V35H32V51M39 34H46V41H39ZM16 18V10H22V14" fill="none"/><path d="m36 8 5 6m-27 32 7-4m16-15 7 3" opacity=".45"/></svg>';
const bath='<svg viewBox="0 0 64 58" aria-hidden="true"><path d="M8 28 31 14 56 28V51H8ZM43 20V7H49V24"/><path d="M4 28 31 11 60 28M12 35H52M12 42H52M23 51V31H35V51M43 31H50V38H43" fill="none"/><path d="M45 3Q40-2 46-7" fill="none"/></svg>';
const stop='<svg viewBox="0 0 64 58" aria-hidden="true"><path d="M8 22 31 10 56 22V26H8ZM13 27H48V48H13Z"/><path d="M13 26V53M49 26V53M17 35H44M20 35V48M40 35V48M54 25V53M51 29H59V39H51Z" fill="none"/></svg>';
import {subscribe} from './client.js?v=live-1';
function receive(s){
  document.getElementById('offline').hidden=true;
  const fragment=document.createDocumentFragment();
  for(const b of s.buildings){
    const el=document.createElement('div');el.className='building'+(b.id===s.selected?' active':'');el.style.left=b.x+'%';el.style.top=b.y+'%';el.dataset.id=b.id;
    el.innerHTML=(b.id===s.selected?'<span class="location"></span>':'')+(b.type==='stop'?stop:b.type==='bath'?bath:house);
    const label=document.createElement('span');label.className='label';label.textContent=b.label;el.append(label);fragment.append(el);
  }
  document.getElementById('buildings').replaceChildren(fragment);
}
subscribe(receive,()=>{document.getElementById('offline').hidden=false;});
