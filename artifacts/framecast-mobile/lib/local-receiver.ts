// Served by the phone, not our cloud. Keeping the receiver and media on the
// same HTTP origin avoids HTTPS-to-private-HTTP mixed-content restrictions.
import { LOCAL_CINEMA_WAITING_CSS, LOCAL_CINEMA_WAITING_MARKUP } from './local-cinema-waiting';
export const LOCAL_RECEIVER_HTML = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FrameCast TV</title><style>
html,body{margin:0;width:100%;height:100%;background:#000;color:#fff;font:20px sans-serif;overflow:hidden}
#video{position:absolute;left:50%;top:50%;width:100vw;height:100vh;max-width:100vw;max-height:100vh;transform:translate(-50%,-50%);transform-origin:center center;object-fit:contain!important;background:#000}
#bar{position:absolute;bottom:0;left:0;right:0;padding:24px;background:linear-gradient(transparent,rgba(84,36,143,.92));display:flex;gap:20px;align-items:center}
button{font:inherit;padding:12px;border:1px solid #ffdf4f;background:#ffdf4f;color:#54248f;border-radius:8px}
#notice{position:absolute;top:12%;left:10%;right:10%;text-align:center;pointer-events:none}
${LOCAL_CINEMA_WAITING_CSS}
#bar,#notice{z-index:30}
</style></head><body class="cinema-waiting">
${LOCAL_CINEMA_WAITING_MARKUP}
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
var fileOrientation=null,mediaUrl='./media'+(config.extension||'.mp4');
function readU32(bytes,offset){return ((bytes[offset]*16777216)+(bytes[offset+1]<<16)+(bytes[offset+2]<<8)+bytes[offset+3])>>>0;}
function readI32(bytes,offset){var value=readU32(bytes,offset);return value>2147483647?value-4294967296:value;}
function readBox(bytes,offset,end){
 if(offset<0||offset+8>end)return null;
 var size=readU32(bytes,offset),header=8,type=String.fromCharCode(bytes[offset+4],bytes[offset+5],bytes[offset+6],bytes[offset+7]);
 if(size===1){if(offset+16>end)return null;size=readU32(bytes,offset+8)*4294967296+readU32(bytes,offset+12);header=16;}
 else if(size===0)size=end-offset;
 if(size<header||size>end-offset)return null;
 return {type:type,start:offset,data:offset+header,end:offset+size};
}
function childBoxes(bytes,start,end,callback){
 for(var p=start;p+8<=end;){var box=readBox(bytes,p,end);if(!box)break;callback(box);p=box.end;}
}
function parseMovieOrientation(bytes){
 for(var marker=bytes.length-4;marker>=4;marker--){
  if(bytes[marker]!==109||bytes[marker+1]!==111||bytes[marker+2]!==111||bytes[marker+3]!==118)continue;
  var moov=readBox(bytes,marker-4,bytes.length);if(!moov||moov.type!=='moov')continue;
  var result=null;
  childBoxes(bytes,moov.data,moov.end,function(trak){
   if(trak.type!=='trak')return;
   var tkhd=null,isVideo=false;
   childBoxes(bytes,trak.data,trak.end,function(child){
    if(child.type==='tkhd')tkhd=child;
    if(child.type==='mdia')childBoxes(bytes,child.data,child.end,function(mediaChild){
     if(mediaChild.type==='hdlr'&&mediaChild.data+12<=mediaChild.end){
      isVideo=String.fromCharCode(bytes[mediaChild.data+8],bytes[mediaChild.data+9],bytes[mediaChild.data+10],bytes[mediaChild.data+11])==='vide';
     }
    });
   });
   if(!isVideo||!tkhd||tkhd.data>=tkhd.end)return;
   var version=bytes[tkhd.data],matrix=tkhd.data+(version===1?52:40);
   if(matrix+44>tkhd.end)return;
   var a=readI32(bytes,matrix),b=readI32(bytes,matrix+4);
   var rawRotation=((Math.round((-Math.atan2(b,a)*180/Math.PI)/90)*90)%360+360)%360;
   var width=readU32(bytes,matrix+36)/65536,height=readU32(bytes,matrix+40)/65536;
   result={rotation:rawRotation,width:width,height:height};
  });
  if(result)return result;
 }
 return null;
}
function appliedRotation(){
 if(!fileOrientation||!fileOrientation.rotation)return 0;
 var rotation=fileOrientation.rotation,width=fileOrientation.width,height=fileOrientation.height;
 if((rotation!==90&&rotation!==270)||!width||!height||!video.videoWidth||!video.videoHeight)return 0;
 var raw=width/height,rendered=video.videoWidth/video.videoHeight;
 return Math.abs(rendered-raw)<Math.abs(rendered-1/raw)?rotation:0;
}
function fitVideoToScreen(){
 video.style.objectFit='contain';
 var width=typeof window!=='undefined'?(window.innerWidth||document.documentElement.clientWidth):0;
 var height=typeof window!=='undefined'?(window.innerHeight||document.documentElement.clientHeight):0;
 var rotation=appliedRotation(),quarter=rotation===90||rotation===270;
 video.style.width=(quarter?height:width)+'px';
 video.style.height=(quarter?width:height)+'px';
 video.style.transform='translate(-50%,-50%) rotate('+rotation+'deg)';
}
function readVideoOrientation(){
 var requestedMediaUrl=mediaUrl;
 fetch(requestedMediaUrl,{method:'HEAD',cache:'no-store'}).then(function(head){
  var length=Number(head.headers&&head.headers.get('content-length'));if(!head.ok||!isFinite(length)||length<1)return null;
  var limits=[1024*1024,4*1024*1024],attempt=0;
  function readRange(start,end){
   return fetch(requestedMediaUrl,{headers:{Range:'bytes='+start+'-'+end},cache:'no-store'}).then(function(response){
    if(response.status!==206)return null;
    return response.arrayBuffer().then(function(buffer){return new Uint8Array(buffer);});
   });
  }
  function readTail(){
   var limit=limits[attempt++],start=Math.max(0,length-limit);
   return readRange(start,length-1).then(function(bytes){
    if(!bytes)return null;
    var info=parseMovieOrientation(bytes);
    if(info)return info;
    return attempt<limits.length?readTail():null;
   });
  }
  return readRange(0,Math.min(length-1,262143)).then(function(bytes){
   var info=bytes&&parseMovieOrientation(bytes);
   return info||readTail();
  });
 }).then(function(info){if(info&&mediaUrl===requestedMediaUrl){fileOrientation=info;fitVideoToScreen();}}).catch(function(){});
}
video.addEventListener('loadedmetadata',fitVideoToScreen);
if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('resize',fitVideoToScreen);
  var cursor=Number(config.after)||0,seconds=5,exiting=false,polling=false,stateBusy=false,stateAgain=false,lastCommand=0,playback='opening',problem='',fullscreenFeedback='',videoOutputTimer=0;
var session=config.sessionId,fullscreenAttempted=false,fullscreenDenied=false;
function post(type,payload){
 return fetch(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({from:'tv',type:type,payload:payload})}).then(function(r){if(!r.ok)throw Error('Connection failed');return r.json();});
}
function cinemaWaiting(visible,title,detail){
 if(document.body)document.body.className=visible?'cinema-waiting':'';
 var heading=document.getElementById('cinema-title'),description=document.getElementById('cinema-detail');
 if(heading)heading.textContent=title||'Your phone is connected';
 if(description)description.textContent=detail||'Choose your next photo or video on your phone.';
}
cinemaWaiting(true,'Opening your video…','Keep FrameCast open on your phone.');
function state(){
 if(exiting)return;
 if(stateBusy){stateAgain=true;return;}
 stateAgain=false;
 stateBusy=true;
 post('player-state',{sessionId:session,currentTime:video.currentTime||0,duration:isFinite(video.duration)?video.duration:0,
 volume:video.muted?0:video.volume,paused:video.paused,playback:playback,message:problem||fullscreenFeedback}).catch(function(){}).then(function(){stateBusy=false;if(stateAgain)state();});
}
function leave(after,freshRoom){
 exiting=true;video.pause();
 var target=new URL(config.returnUrl);
 if(freshRoom){
  ['resume','after','join','code','expiresAt'].forEach(function(key){target.searchParams.delete(key);});
  target.searchParams.set('fresh','1');
 }else{target.searchParams.set('resume','1');target.searchParams.set('after',String(after));}
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
  var localOpenVersion=0;
  function openNextLocalVideo(message,target){
   cinemaWaiting(true,'Preparing your next video…','Your phone is connected. Keep FrameCast open.');
   var attempts=0,version=++localOpenVersion;
  function probe(){
    if(exiting||version!==localOpenVersion)return;
   // no-cors keeps this probe from needing a wildcard CORS grant on the
   // phone's private media server. A network failure rejects; an opaque
   // response still confirms the TV can reach the server.
   fetch(target.href,{method:'HEAD',mode:'no-cors',cache:'no-store'}).then(function(){
     if(exiting||version!==localOpenVersion)return;
    config.sessionId=message.payload.sessionId;config.extension=message.payload.extension;config.after=message.sequence;config.resumeAt=Math.max(0,Number(message.payload.resumeAt)||0);
     // Keep this document (and its recovery handlers/fullscreen) alive even
     // when the phone replaces its HTTP server. Never navigate the browser
     // to a new local receiver between playlist tracks.
     session=config.sessionId;
     clearTimeout(networkRetryTimer);clearTimeout(startupRetryTimer);clearTimeout(videoOutputTimer);
     networkRetryDeadline=0;startupRetryCount=0;playedAtLeastOnce=false;
     resumePosition=config.resumeAt;fileOrientation=null;problem='';playback='opening';
     mediaUrl=new URL('./media'+(config.extension||'.mp4'),target.href).href;
     notice.textContent='Loading the next video from your phone…';
     video.src=mediaUrl;fitVideoToScreen();readVideoOrientation();
     video.load();play();state();
   }).catch(function(){
     if(exiting||version!==localOpenVersion)return;
    if(attempts<2){attempts++;setTimeout(probe,250*attempts);return;}
    playback='error';problem='TV_LOCAL_SERVER_UNREACHABLE';
    notice.textContent='The phone video link is temporarily unreachable. Keeping this screen open while FrameCast retries…';
    post('player-state',{sessionId:message.payload.sessionId,playback:'error',message:problem}).catch(function(){});
    reveal();
    // Let the phone start the compatibility path. Returning to its web page
    // keeps large-video failures recoverable instead of leaving Samsung on
    // its browser-owned "server not found" screen.
     setTimeout(function(){if(!exiting&&version===localOpenVersion)leave(cursor);},5000);
   });
  }
  probe();
 }
var phoneChallenge='local-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
var phoneReplyAt=Date.now(),phoneProbeAt=0;
function poll(){
 if(exiting||polling)return;polling=true;
 if(Date.now()-phoneReplyAt>=45000){
  // Leave a dead phone-hosted receiver without creating a different TV room.
  // The online receiver can answer the reopened phone's restoration challenge.
  cinemaWaiting(true,'Phone away','Reopen FrameCast on your phone to reconnect.');
  leave(cursor,false);return;
 }
 if(Date.now()-phoneProbeAt>=5000){
  phoneProbeAt=Date.now();
  post('ready',{action:'phone-presence-ping',sessionId:phoneChallenge}).catch(function(){});
 }
 fetch(endpoint.href,{cache:'no-store'}).then(function(r){if(!r.ok)throw Error('Room unavailable');return r.json();}).then(function(data){
  var messages=data.messages||[];
  for(var i=0;i<messages.length;i++){
   var m=messages[i];if(m.sequence<=cursor)continue;cursor=m.sequence;
   if(m.from!=='phone')continue;
    if(m.type==='ready'&&m.payload&&m.payload.action==='phone-presence-pong'){
     if(m.payload.sessionId===phoneChallenge)phoneReplyAt=Date.now();
     continue;
    }
    if(m.type==='ready'&&m.payload&&m.payload.action==='connection-ping'){
     post('ready',{action:'connection-pong',sessionId:m.payload.sessionId}).catch(function(){});
     continue;
    }
   if(m.type==='close'){leave(cursor,m.payload&&m.payload.action==='disconnect');return;}
   if(m.type==='offer'){leave(m.sequence-1);return;}
    if(m.type==='local-video'&&m.payload.sessionId!==session){
    var next=new URL(m.payload.receiverUrl);
     if(next.protocol!=='http:'||next.username||next.password||!isPrivate(next.hostname)||!/^\\/[a-z0-9]+\\/receiver[.]html$/.test(next.pathname)||!/^\\.[a-z0-9]{1,8}$/.test(m.payload.extension||'.mp4'))continue;
     openNextLocalVideo(m,next);return;
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
 var networkRetryDeadline=0,networkRetryTimer=0,startupRetryTimer=0,startupRetryCount=0,resumePosition=Math.max(0,Number(config.resumeAt)||0),playedAtLeastOnce=false;
function checkVideoOutput(){
 clearTimeout(videoOutputTimer);
 videoOutputTimer=setTimeout(function(){
  if(exiting||video.paused||video.ended||video.videoWidth>0||video.currentTime<1||!isFinite(video.duration))return;
  playback='error';fullscreenFeedback='';
  problem='The TV is playing sound but has not decoded a picture. This TV browser may not support this video format, such as HEVC/H.265. Try an H.264/AVC MP4 or a compatible TV player.';
  notice.textContent=problem;video.pause();state();reveal();
 },2500);
}
video.onplaying=function(){cinemaWaiting(false);playedAtLeastOnce=true;networkRetryDeadline=0;clearTimeout(networkRetryTimer);playback='playing';problem='';notice.textContent='';checkVideoOutput();state();if(!fullscreenAttempted){fullscreenAttempted=true;fullscreen();}};
 video.addEventListener('loadedmetadata',function(){
  startupRetryCount=0;clearTimeout(startupRetryTimer);
  if(resumePosition>0){video.currentTime=resumePosition;resumePosition=0;}
 });
video.onwebkitendfullscreen=function(){fullscreenDenied=false;fullscreenFeedback='FULLSCREEN_EXITED';reveal();state();};
video.onpause=function(){clearTimeout(videoOutputTimer);state();};
video.onwaiting=function(){notice.textContent='Buffering from your phone…';};
video.onended=function(){cinemaWaiting(true,'Your phone is connected','Ready for your next photo or video.');clearTimeout(videoOutputTimer);playback='ended';state();reveal();};
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
   if(!networkRetryDeadline)networkRetryDeadline=Date.now()+15000;
  if(Date.now()<networkRetryDeadline){
   resumePosition=Math.max(resumePosition,video.currentTime||0);
    playback='opening';problem='';notice.textContent='Trying the phone connection again…';state();
   clearTimeout(networkRetryTimer);networkRetryTimer=setTimeout(function(){if(!exiting){video.load();play();}},2000);return;
  }
 }
  if(errorCode===2&&!exiting){
   playback='error';problem='TV_LOCAL_SERVER_UNREACHABLE';
   notice.textContent='The phone video link stopped responding. Reconnecting through FrameCast…';
   video.pause();state();reveal();return;
  }
  playback='error';
  problem=errorCode===4
   ? 'This TV browser does not support this video format or codec. Try a standard H.264/AVC MP4.'
   : errorCode===3
    ? 'The TV could not decode this video. Try a standard H.264/AVC MP4.'
    : 'The TV could not read the video from your phone. Keep FrameCast open and try again.';
  notice.textContent=problem;state();reveal();
};
video.src=mediaUrl;
readVideoOrientation();
video.load();play();setInterval(poll,500);setInterval(state,3000);poll();state();
})();
</script></body></html>`;
