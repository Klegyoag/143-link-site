const API='https://143-backend-staging.vercel.app/api/index.php/api/v1';
let access=sessionStorage.getItem('143_link_token')||'';
let installPrompt=null;
let pairingTimer=null;

const $=(q,scope=document)=>scope.querySelector(q);
const $$=(q,scope=document)=>[...scope.querySelectorAll(q)];
const uuid=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;

function enablePwa(){
  const manifest=document.createElement('link');manifest.rel='manifest';manifest.href='manifest.webmanifest';document.head.append(manifest);
  const apple=document.createElement('meta');apple.name='apple-mobile-web-app-capable';apple.content='yes';document.head.append(apple);
  if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
enablePwa();

$('.menu-toggle')?.addEventListener('click',()=>$('.nav')?.classList.toggle('mobile-open'));
$$('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());
$('#helpSearch')?.addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();$$('.faq').forEach(x=>x.style.display=x.textContent.toLowerCase().includes(q)?'block':'none');});

async function api(path,options={}){
  const headers={'Accept':'application/json','Content-Type':'application/json',...(options.headers||{})};
  if(access)headers.Authorization='Bearer '+access;
  if((options.method||'GET')!=='GET')headers['Idempotency-Key']=uuid();
  const response=await fetch(API+path,{...options,headers,cache:'no-store'});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.detail||body.message||Object.values(body.errors||{})?.flat?.()[0]||'Something went wrong. Please try again.');
  return body.data??body;
}

function browserName(){
  const ua=navigator.userAgent;
  if(ua.includes('Edg/'))return 'Microsoft Edge';if(ua.includes('Chrome/'))return 'Google Chrome';if(ua.includes('Firefox/'))return 'Firefox';if(ua.includes('Safari/'))return 'Safari';return 'Web browser';
}

function setPairingState(label,message,kind='waiting'){
  const pill=$('#pairStatus');const copy=$('#pairMessage');
  if(pill){pill.className=`status-pill ${kind}`;pill.innerHTML=`<span class="pulse"></span>${label}`;}
  if(copy)copy.textContent=message;
}

async function startPairing(){
  const canvas=$('#pairQr');if(!canvas||!window.QRCode)return;
  clearTimeout(pairingTimer);setPairingState('Creating secure code','Preparing a private, short-lived connection…');
  $('#pairRetry')?.setAttribute('hidden','');
  try{
    const session=await api('/linked-devices/qr-sessions',{method:'POST',body:JSON.stringify({device_name:'143 Web',platform:matchMedia('(display-mode: standalone)').matches?'pwa':'web',browser:browserName()})});
    $('#pairCode').textContent=session.pairing_code;
    canvas.replaceChildren();new window.QRCode(canvas,{text:session.qr_payload,width:200,height:200,colorDark:'#171421',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M});
    setPairingState('Waiting for phone','Open 143 → Us → Linked devices → Scan QR, then approve this browser.');
    const deadline=new Date(session.expires_at).getTime();
    const poll=async()=>{
      if(Date.now()>=deadline){setPairingState('Code expired','For your safety, pairing codes last only two minutes. Create a fresh one to continue.','error');$('#pairRetry')?.removeAttribute('hidden');return;}
      try{
        const state=await api(`/linked-devices/qr-sessions/${encodeURIComponent(session.session_id)}?browser_secret=${encodeURIComponent(session.browser_secret)}`);
        if(state.status==='approved'&&state.exchange_grant){
          setPairingState('Phone approved','Finishing your secure connection…','approved');
          const tokens=await api(`/linked-devices/qr-sessions/${encodeURIComponent(session.session_id)}/exchange`,{method:'POST',body:JSON.stringify({browser_secret:session.browser_secret,exchange_grant:state.exchange_grant})});
          access=tokens.access_token;sessionStorage.setItem('143_link_token',access);sessionStorage.setItem('143_link_refresh',tokens.refresh_token||'');
          showLinked(tokens.user);return;
        }
        if(state.status==='expired'||state.status==='cancelled'){setPairingState('Code expired','Create a fresh code and scan it again.','error');$('#pairRetry')?.removeAttribute('hidden');return;}
      }catch(e){setPairingState('Reconnecting','Your code is still safe. Checking the connection again…');}
      pairingTimer=setTimeout(poll,2200);
    };
    pairingTimer=setTimeout(poll,1500);
  }catch(e){setPairingState('Could not start','The linking service is unavailable right now. Please try again.','error');$('#pairRetry')?.removeAttribute('hidden');}
}

function showLinked(user){
  const main=$('.login-main');if(!main)return;
  const name=user?.display_name||user?.username||'your account';
  main.innerHTML=`<div class="linked-success"><div class="success-check">✓</div><div class="kicker"><span class="kicker-dot"></span>Connected</div><h2>This browser is linked.</h2><p>143 Web is securely connected to <strong>${escapeHtml(name)}</strong>. You can revoke it any time from Linked devices on your phone.</p><a class="btn btn-primary" href="index.html">Continue to 143</a></div>`;
}
function escapeHtml(v){const e=document.createElement('div');e.textContent=v;return e.innerHTML;}

$('#pairRetry')?.addEventListener('click',startPairing);
if($('#pairQr'))startPairing();

$('#altLoginBtn')?.addEventListener('click',()=>$('#fallback')?.classList.toggle('open'));
$('#loginForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const err=$('#loginError');if(err)err.textContent='';
  try{const data=await api('/auth/login',{method:'POST',body:JSON.stringify({username:$('#username').value.trim(),password:$('#password').value,device_name:'143 Linked Web'})});access=data.access_token;sessionStorage.setItem('143_link_token',access);$('#legacyLink')?.classList.add('open');$('#altLoginBtn').textContent='Signed in — enter the link details from your phone';}
  catch(ex){if(err)err.textContent=ex.message;}
});
$('#linkForm')?.addEventListener('submit',async e=>{
  e.preventDefault();const err=$('#linkError');if(err)err.textContent='';
  try{await api('/linked-devices/link-intents/'+encodeURIComponent($('#intent').value.trim())+'/confirm',{method:'POST',body:JSON.stringify({link_token:$('#linkToken').value.trim(),device_id:'web-'+uuid(),device_name:$('#deviceName').value.trim()||'143 Web',platform:'web'})});$('#legacyLink').innerHTML='<div class="notice success"><b>Device linked.</b> This browser is now registered with your 143 account.</div>';}
  catch(ex){if(err)err.textContent=ex.message;}
});

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;const button=$('#installPwa');if(button){button.disabled=false;button.textContent='Install 143 Web';}});
$('#installPwa')?.addEventListener('click',async()=>{
  if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;return;}
  const hint=$('#installHint');if(hint)hint.textContent=/iPhone|iPad/.test(navigator.userAgent)?'Tap Share, then “Add to Home Screen”.':'Open your browser menu and choose “Install app” or “Add to Home screen”.';
});
