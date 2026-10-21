const tagline='Uniworld. Your world, beautifully connected.';

export function showBrandIntro(force=false){
  let seen=false;
  try{seen=sessionStorage.getItem('uniworld:intro-v5')==='1'}catch{}
  if((seen&&!force)||document.querySelector('#brandIntro'))return;
  const previous=document.activeElement;
  const intro=document.createElement('dialog');
  intro.id='brandIntro';
  intro.setAttribute('aria-labelledby','introTitle');
  intro.innerHTML=`<div class="intro-landscape" aria-hidden="true"></div><div class="intro-shade" aria-hidden="true"></div><button class="intro-skip" type="button">Skip intro ↗</button><div class="intro-center"><span class="intro-eyebrow">A WORLD WORTH DISCOVERING</span><div class="intro-orbit" aria-hidden="true"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="35"/><ellipse cx="60" cy="60" rx="17" ry="35"/><path d="M25 60h70M31 40q29 22 58 0M31 80q29-22 58 0"/><ellipse class="intro-ring" cx="60" cy="60" rx="57" ry="20" transform="rotate(-30 60 60)"/></svg></div><h1 id="introTitle">uniworld<span>.</span></h1><p>Your world,<br><em>beautifully connected.</em></p><div class="intro-actions"><button class="intro-sound" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>Begin with sound</button><button class="intro-quiet" type="button">Explore quietly</button></div><span class="intro-caption" role="status" aria-live="polite">A little inspiration. A world of possibility.</span></div><div class="intro-bottom"><span>PAKISTAN · UNITED KINGDOM · USA</span><span>YOUR NEXT CHAPTER AWAITS</span></div>`;
  document.body.append(intro);
  let done=false,audio,audioUrl,voiceTimer;
  const soundButton=intro.querySelector('.intro-sound');
  soundButton.textContent='Explore Uniworld ↗';
  globalThis.caches?.open('uw-natural-welcome-v1').then(c=>c.match('/natural-welcome.wav')).then(async response=>{if(!response||done)return;audioUrl=URL.createObjectURL(await response.blob());soundButton.textContent='Begin with natural voice';}).catch(()=>{});
  const finish=()=>{
    if(done)return;done=true;clearTimeout(timer);clearTimeout(voiceTimer);
    audio?.pause();if(audioUrl)URL.revokeObjectURL(audioUrl);
    try{sessionStorage.setItem('uniworld:intro-v5','1')}catch{}
    intro.classList.add('intro-leaving');
    setTimeout(()=>{intro.close();intro.remove();previous?.focus?.({preventScroll:true})},matchMedia('(prefers-reduced-motion: reduce)').matches?0:550);
  };
  let timer=setTimeout(finish,8000);
  const speak=()=>{
    if(done)return;if(!audioUrl){finish();return}clearTimeout(timer);
    intro.classList.add('intro-speaking');
    intro.querySelector('.intro-sound').disabled=true;
    intro.querySelector('.intro-caption').textContent=tagline;
    voiceTimer=setTimeout(finish,10000);
    audio=new Audio(audioUrl);audio.onended=()=>setTimeout(finish,350);audio.onerror=finish;audio.play().catch(finish);
  };
  intro.querySelector('.intro-sound').addEventListener('click',speak);
  intro.querySelector('.intro-quiet').addEventListener('click',finish);
  intro.querySelector('.intro-skip').addEventListener('click',finish);
  intro.addEventListener('cancel',e=>{e.preventDefault();finish()});
  const pageHidden=()=>{if(document.hidden){finish();document.removeEventListener('visibilitychange',pageHidden)}};
  document.addEventListener('visibilitychange',pageHidden);
  intro.addEventListener('close',()=>document.removeEventListener('visibilitychange',pageHidden),{once:true});
  intro.showModal();
}
