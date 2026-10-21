// Served by the phone, not our cloud. Keeping the receiver and media on the
// same HTTP origin avoids HTTPS-to-private-HTTP mixed-content restrictions.
export const LOCAL_RECEIVER_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FrameCast TV</title><style>
html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font:20px sans-serif;overflow:hidden}
video{width:100%;height:100%;object-fit:contain}
#bar{position:absolute;bottom:0;left:0;right:0;padding:24px;background:linear-gradient(transparent,rgba(0,0,0,.9));display:flex;gap:20px;align-items:center}
button{font:inherit;padding:12px;border:1px solid #aaa;background:#203b32;color:white;border-radius:8px}
#notice{position:absolute;top:12%;left:10%;right:10%;text-align:center;pointer-events:none}
</style></head><body>
<video id="video" autoplay controls playsinline webkit-playsinline preload="auto"></video>
<div id="notice">Connected. Opening video directly from your phone…</div>
<div id="bar"><button id="play">Play / pause</button><button id="mute">Sound / mute</button>
<button id="full">Full screen</button><button id="back">Back to pairing</button><span id="timer">5</span></div>
<script>
(function(){
'use strict';
var config;
try{config=JSON.parse(decodeURIComponent(location.hash.slice(1)));}catch(e){document.getElementById('notice').textContent='Open this screen from your paired FrameCast phone.';return;}
var endpoint;
try{
 endpoint=new URL(config.endpoint);
 if(endpoint.protocol!=='https:' || new URL(config.returnUrl).origin!==endpoint.origin) throw Error();
}catch(e){document.getElementById('notice').textContent='Invalid pairing address.';return;}
var video=document.getElementById('video'),bar=document.getElementById('bar'),notice=document.getElementById('notice');
video.style.objectFit='contain';
var cursor=Number(config.after)||0,seconds=5,exiting=false,polling=false,stateBusy=false,lastCommand=0,playback='opening',problem='',fullscreenFeedback='',videoOutputTimer=0;
var session=config.sessionId,fullscreenAttempted=false,fullscreenDenied=false;
function post(type,payload){
 return fetch(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:'tv',type:type,payload:payload})}).then(function(r){if(!r.ok)throw Error('Connection failed');return r.json();});
}
function state(){
 if(stateBusy||exiting)return;
 stateBusy=true;
 post('player-state',{sessionId:session,currentTime:video.currentTime||0,duration:isFinite(video.duration)?video.duration:0,
 volume:video.muted?0:video.volume,paused:video.paused,playback:playback,message:problem||fullscreenFeedback}).catch(function(){}).then(function(){stateBusy=false;});
}
function leave(after){
 exiting=true;video.pause();
 var target=new URL(config.returnUrl);target.searchParams.set('resume','1');target.searchParams.set('after',String(after));
 location.replace(target.href);
}
function reveal(){seconds=5;bar.style.display='flex';document.getElementById('timer').textContent='5';}
function fullscreen(){
 // The video already fills this page. Fullscreen the page instead of handing
 // it to Samsung's separate native movie overlay, which can show an OS dialog.
 var requests=document.fullscreenEnabled===false?[]:[
  [document.documentElement,document.documentElement.requestFullscreen],[document.documentElement,document.documentElement.webkitRequestFullscreen],[document.documentElement,document.documentElement.webkitRequestFullScreen]];
 fullscreenFeedback='FULLSCREEN_REQUESTED';
 function next(i){
   if(i>=requests.length){fullscreenDenied=true;fullscreenFeedback='FULLSCREEN_NEEDS_TV_REMOTE';notice.textContent=document.fullscreenEnabled===false?'Video can play here. Use Full screen in the TV browser menu to hide its address bar.':'Press Full screen or OK on the TV remote. This TV browser requires its own button press.';reveal();state();return;}
  var owner=requests[i][0],request=requests[i][1];
  if(!request){next(i+1);return;}
  try{Promise.resolve(request.call(owner)).then(function(){setTimeout(function(){if(isFullscreen()){fullscreenDenied=false;fullscreenFeedback='FULLSCREEN_OK';notice.textContent='';state();}else next(i+1);},250);},function(){next(i+1);});}catch(e){next(i+1);}
 }
 next(0);
}
function isFullscreen(){
 return !!(document.fullscreenElement||document.webkitFullscreenElement||video.webkitDisplayingFullscreen||video.webkitPresentationMode==='fullscreen');
}
function fullscreenChanged(){
 if(isFullscreen()){fullscreenDenied=false;fullscreenFeedback='FULLSCREEN_OK';}
 else if(fullscreenFeedback==='FULLSCREEN_OK')fullscreenFeedback='FULLSCREEN_EXITED';
 state();
}
if(document.addEventListener){document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('webkitfullscreenchange',fullscreenChanged);}
function exitFullscreen(){
 var native=video.webkitDisplayingFullscreen||video.webkitPresentationMode==='fullscreen';
 var request=native?(video.webkitExitFullscreen||video.webkitExitFullScreen):(document.exitFullscreen||document.webkitExitFullscreen||document.webkitCancelFullScreen);
 if(request){try{var result=request.call(native?video:document);if(result&&result.catch)result.catch(function(){});}catch(e){}}
 fullscreenDenied=false;fullscreenFeedback='FULLSCREEN_EXITED';reveal();state();
}
function play(){var result=video.play();if(result&&result.catch)result.catch(function(){notice.textContent='Press Play on the TV remote to start with sound.';playback='blocked';state();reveal();});}
function command(action){
 if(action==='play')play();
 else if(action==='pause')video.pause();
 else if(action.indexOf('video:seek:')===0){var t=Number(action.slice(11));if(isFinite(t))video.currentTime=Math.max(0,t);}
 else if(action.indexOf('video:seek-by:')===0){var d=Number(action.slice(14));if(isFinite(d))video.currentTime=Math.max(0,Math.min(video.duration||Infinity,video.currentTime+d));}
 else if(action.indexOf('video:volume:')===0){var v=Number(action.slice(13));if(isFinite(v)){video.volume=Math.min(1,Math.max(0,v));video.muted=v===0;}}
 else if(action==='video:mute')video.muted=!video.muted;
  else if(action==='video:fit:contain')video.style.objectFit='contain';
 else if(action==='video:fullscreen'||action==='fullscreen:enter')fullscreen();
 else if(action==='fullscreen:exit')exitFullscreen();
 state();
}
function poll(){
 if(exiting||polling)return;polling=true;
 fetch(endpoint.href,{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('Room unavailable');return r.json();}).then(function(data){
  var messages=data.messages||[];
  for(var i=0;i<messages.length;i++){
   var m=messages[i];if(m.sequence<=cursor)continue;cursor=m.sequence;
   if(m.from!=='phone')continue;
   if(m.type==='close'){leave(cursor);return;}
   if(m.type==='offer'){leave(m.sequence-1);return;}
   if(m.type==='local-video'&&m.payload.sessionId!==session){
    var next=new URL(m.payload.receiverUrl);
    if(next.protocol!=='http:'||next.username||next.password||!isPrivate(next.hostname)||!/^\\/[a-z0-9]+\\/receiver[.]html$/.test(next.pathname))continue;
    config.sessionId=m.payload.sessionId;config.extension=m.payload.extension;config.after=m.sequence;
    exiting=true;location.replace(next.href+'#'+encodeURIComponent(JSON.stringify(config)));return;
   }
   if(m.type==='player-command'&&m.payload.sessionId===session&&m.sequence>lastCommand){
    lastCommand=m.sequence;command(m.payload.action||'');
   }
  }
 }).catch(function(){notice.textContent='Connection interrupted. Keep the phone app open and check Wi-Fi.';}).then(function(){polling=false;});
}
function isPrivate(host){return /^(10\\.\\d+\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+|172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+)$/.test(host)&&host.split('.').every(function(n){return Number(n)<=255;});}
document.getElementById('play').onclick=function(){if(video.paused)play();else video.pause();reveal();};
document.getElementById('mute').onclick=function(){video.muted=!video.muted;state();reveal();};
document.getElementById('full').onclick=fullscreen;
document.getElementById('back').onclick=function(){post('close',{}).then(function(result){leave(result.sequence);}).catch(function(){notice.textContent='Could not reconnect. Check your internet connection.';});};
document.onkeydown=function(e){
 reveal();
 if((e.key==='Escape'||e.key==='Backspace'||e.key==='BrowserBack'||e.keyCode===10009)&&isFullscreen()){if(e.preventDefault)e.preventDefault();exitFullscreen();return;}
 if((e.key==='Enter'||e.key==='MediaPlayPause'||e.keyCode===13||e.keyCode===10252)&&(!e.target||e.target.tagName!=='BUTTON')){
  if(fullscreenDenied)fullscreen();
  else if(video.paused)play();else video.pause();
 }
 if(e.key==='MediaPlay'||e.keyCode===415){if(fullscreenDenied)fullscreen();play();}
 if(e.key==='MediaPause'||e.keyCode===19)video.pause();
 if(e.keyCode===412)video.currentTime=Math.max(0,video.currentTime-10);
 if(e.keyCode===417)video.currentTime=Math.min(video.duration||Infinity,video.currentTime+10);
 if(e.key==='MediaStop'||e.keyCode===413){video.pause();video.currentTime=0;}
};
document.onmousemove=reveal;document.onclick=reveal;document.ontouchstart=reveal;
setInterval(function(){if(--seconds<=0)bar.style.display='none';else document.getElementById('timer').textContent=String(seconds);},1000);
 var networkRetryDeadline=0,networkRetryTimer=0,startupRetryTimer=0,startupRetryCount=0,resumePosition=0,playedAtLeastOnce=false;
function checkVideoOutput(){
 clearTimeout(videoOutputTimer);
 videoOutputTimer=setTimeout(function(){
  if(exiting||video.paused||video.ended||video.videoWidth>0||video.currentTime<1||!isFinite(video.duration))return;
  playback='error';fullscreenFeedback='';
  problem='The TV is playing sound but has not decoded a picture. This TV browser may not support this video format, such as HEVC/H.265. Try an H.264/AVC MP4 or a compatible TV player.';
  notice.textContent=problem;video.pause();state();reveal();
 },2500);
}
video.onplaying=function(){playedAtLeastOnce=true;networkRetryDeadline=0;clearTimeout(networkRetryTimer);playback='playing';problem='';notice.textContent='';checkVideoOutput();state();if(!fullscreenAttempted){fullscreenAttempted=true;fullscreen();}};
 video.addEventListener('loadedmetadata',function(){
  startupRetryCount=0;clearTimeout(startupRetryTimer);
  if(resumePosition>0){video.currentTime=resumePosition;resumePosition=0;}
 });
video.onwebkitendfullscreen=function(){fullscreenDenied=false;fullscreenFeedback='FULLSCREEN_EXITED';reveal();state();};
video.onpause=function(){clearTimeout(videoOutputTimer);state();};
video.onwaiting=function(){notice.textContent='Buffering from your phone…';};
video.onended=function(){clearTimeout(videoOutputTimer);playback='ended';state();reveal();};
video.onerror=function(){
  clearTimeout(videoOutputTimer);
  var errorCode=video.error?video.error.code:0;
  // TV browsers can briefly fail the first local-file request while a video
  // is selected or the phone's server is being replaced. Reopen only during
  // initial metadata loading, with a strict retry limit so unsupported codecs
  // still fail promptly and honestly.
  if(!playedAtLeastOnce&&video.readyState===0&&(errorCode===2||errorCode===4)&&startupRetryCount<2&&!exiting){
   startupRetryCount++;
   playback='opening';problem='';notice.textContent='Reopening the video from your phone…';state();
   clearTimeout(startupRetryTimer);
   startupRetryTimer=setTimeout(function(){
    if(!exiting&&!playedAtLeastOnce&&video.readyState===0){video.load();play();}
   },900*startupRetryCount);
   return;
  }
  if(video.error&&(errorCode===2||(playedAtLeastOnce&&errorCode===4))&&!exiting){
  if(!networkRetryDeadline)networkRetryDeadline=Date.now()+60000;
  if(Date.now()<networkRetryDeadline){
   resumePosition=Math.max(resumePosition,video.currentTime||0);
   playback='opening';problem='';notice.textContent='Waiting for your phone. Keeping the connection for one minute…';state();
   clearTimeout(networkRetryTimer);networkRetryTimer=setTimeout(function(){if(!exiting){video.load();play();}},2000);return;
  }
 }
  playback='error';
  problem=errorCode===4
   ? 'This TV browser does not support this video format or codec. Try a standard H.264/AVC MP4.'
   : errorCode===3
    ? 'The TV could not decode this video. Try a standard H.264/AVC MP4.'
    : 'The TV could not read the video from your phone. Keep FrameCast open and try again.';
  notice.textContent=problem;state();reveal();
};
video.src='./media'+(config.extension||'.mp4');
video.load();play();setInterval(poll,500);setInterval(state,3000);poll();state();
})();
</script></body></html>`;
