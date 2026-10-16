const video=document.getElementById('banner'),error=document.getElementById('error');
// Muted playback starts automatically in iOS browser widgets.
video.muted=true;
function play(){video.play().catch(()=>{error.hidden=false;error.textContent='Нажми, чтобы запустить баннер';});}
video.addEventListener('playing',()=>{error.hidden=true;});
video.addEventListener('error',()=>{error.hidden=false;},true);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)play();});
document.addEventListener('click',play);
play();
