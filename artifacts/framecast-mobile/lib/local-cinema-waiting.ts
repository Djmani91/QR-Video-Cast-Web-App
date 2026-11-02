// Static, script-free cinema waiting surface for the phone-served local receiver.
// Hidden by default; shown when <body> has class "cinema-waiting".
export const LOCAL_CINEMA_WAITING_CSS =
  ".fc-local-cinema{display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:20;overflow:hidden;background:#54248f;color:#fff;font-family:sans-serif}" +
  "body.cinema-waiting .fc-local-cinema{display:block}" +
  ".fc-local-cinema .lc-beam{position:absolute;left:20%;right:20%;top:0;height:80%;background:linear-gradient(rgba(255,223,79,.22),rgba(255,223,79,0));-webkit-clip-path:polygon(50% 0,100% 100%,0 100%);clip-path:polygon(50% 0,100% 100%,0 100%)}" +
  ".fc-local-cinema .lc-card{position:absolute;left:0;width:150px;height:112px;border-radius:10px;border:3px solid #fff;background:#ffdf4f;overflow:hidden;opacity:.75;-webkit-transform:translateX(110vw);transform:translateX(110vw);-webkit-animation:lc-glide 38s linear infinite;animation:lc-glide 38s linear infinite}" +
  ".fc-local-cinema .lc-photo:before{content:'';position:absolute;left:-10%;right:-10%;bottom:-20%;height:60%;background:#54248f;border-radius:50% 50% 0 0;opacity:.75}" +
  ".fc-local-cinema .lc-photo:after{content:'';position:absolute;top:16%;right:16%;width:26px;height:26px;border-radius:50%;background:#fff}" +
  ".fc-local-cinema .lc-video{background:#6d34b5;border-color:#ffdf4f}" +
  ".fc-local-cinema .lc-video:after{content:'';position:absolute;top:50%;left:50%;margin:-14px 0 0 -8px;border-style:solid;border-width:14px 0 14px 22px;border-color:transparent transparent transparent #ffdf4f}" +
  ".fc-local-cinema .lc-film{background:#fff}" +
  ".fc-local-cinema .lc-film:before{content:'';position:absolute;left:0;right:0;top:16%;bottom:16%;background:#6d34b5}" +
  ".fc-local-cinema .lc-c1{top:12%;-webkit-animation-delay:0s;animation-delay:0s}" +
  ".fc-local-cinema .lc-c2{top:40%;-webkit-animation-duration:44s;animation-duration:44s;-webkit-animation-delay:-14s;animation-delay:-14s}" +
  ".fc-local-cinema .lc-c3{top:66%;-webkit-animation-duration:40s;animation-duration:40s;-webkit-animation-delay:-26s;animation-delay:-26s}" +
  ".fc-local-cinema .lc-c4{top:24%;-webkit-animation-duration:47s;animation-duration:47s;-webkit-animation-delay:-33s;animation-delay:-33s}" +
  ".fc-local-cinema .lc-k{position:absolute;bottom:-30px;width:16px;height:14px;border-radius:50% 45% 50% 40%;background:#fff;opacity:0;-webkit-animation:lc-rise 10s ease-in infinite;animation:lc-rise 10s ease-in infinite}" +
  ".fc-local-cinema .lc-k1{left:14%}.fc-local-cinema .lc-k2{left:38%;-webkit-animation-delay:-4s;animation-delay:-4s}" +
  ".fc-local-cinema .lc-k3{left:63%;-webkit-animation-delay:-7s;animation-delay:-7s}.fc-local-cinema .lc-k4{left:86%;-webkit-animation-delay:-2s;animation-delay:-2s}" +
  ".fc-local-cinema .lc-shade{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,rgba(84,36,143,.92),rgba(84,36,143,.55) 45%,rgba(84,36,143,.05))}" +
  ".fc-local-cinema .lc-brand{position:absolute;top:6%;left:7%;font-weight:800;font-size:22px;letter-spacing:-.03em}" +
  ".fc-local-cinema .lc-brand b{color:#ffdf4f}" +
  ".fc-local-cinema .lc-msg{position:absolute;top:50%;left:9%;width:52%;-webkit-transform:translateY(-50%);transform:translateY(-50%)}" +
  ".fc-local-cinema .lc-pill{display:inline-block;padding:9px 14px;border-radius:999px;background:#ffdf4f;color:#54248f;font:700 13px monospace;letter-spacing:.14em}" +
  ".fc-local-cinema .lc-dot{display:inline-block;width:9px;height:9px;margin-left:8px;border-radius:50%;background:#54248f;-webkit-animation:lc-blink 1.6s ease-in-out infinite;animation:lc-blink 1.6s ease-in-out infinite}" +
  ".fc-local-cinema #cinema-title{margin:22px 0 14px;font-size:64px;line-height:1;font-weight:700;letter-spacing:-.04em;color:#fff}" +
  ".fc-local-cinema #cinema-detail{margin:0;font-size:20px;line-height:1.4;color:#ffdf4f}" +
  ".fc-local-cinema .lc-bar{position:relative;width:300px;height:4px;margin-top:22px;border-radius:4px;background:rgba(255,255,255,.2);overflow:hidden}" +
  ".fc-local-cinema .lc-bar i{position:absolute;top:0;bottom:0;left:0;width:40%;background:#ffdf4f;-webkit-animation:lc-load 1.6s ease-in-out infinite;animation:lc-load 1.6s ease-in-out infinite}" +
  ".fc-local-cinema .lc-pop{position:absolute;right:12%;bottom:12%;width:120px;height:130px;-webkit-animation:lc-bob 5.5s ease-in-out infinite;animation:lc-bob 5.5s ease-in-out infinite}" +
  ".fc-local-cinema .lc-tub{position:absolute;left:10px;right:10px;bottom:0;height:80px;border:4px solid #ffdf4f;border-top-width:8px;background:repeating-linear-gradient(90deg,#54248f 0 14px,#ffdf4f 14px 22px);border-radius:0 0 14px 14px}" +
  ".fc-local-cinema .lc-pc{position:absolute;width:36px;height:36px;border-radius:50%;background:#fff;border:2px solid #ffdf4f}" +
  ".fc-local-cinema .lc-p1{left:8px;top:22px}.fc-local-cinema .lc-p2{left:38px;top:6px}.fc-local-cinema .lc-p3{left:70px;top:18px}.fc-local-cinema .lc-p4{left:30px;top:30px}.fc-local-cinema .lc-p5{left:60px;top:34px}" +
  "@-webkit-keyframes lc-glide{from{-webkit-transform:translateX(110vw) rotate(-3deg)}to{-webkit-transform:translateX(-220px) rotate(3deg)}}" +
  "@keyframes lc-glide{from{transform:translateX(110vw) rotate(-3deg)}to{transform:translateX(-220px) rotate(3deg)}}" +
  "@-webkit-keyframes lc-rise{0%{opacity:0;-webkit-transform:translateY(0)}12%{opacity:.85}100%{opacity:0;-webkit-transform:translateY(-105vh) rotate(320deg)}}" +
  "@keyframes lc-rise{0%{opacity:0;transform:translateY(0)}12%{opacity:.85}100%{opacity:0;transform:translateY(-105vh) rotate(320deg)}}" +
  "@-webkit-keyframes lc-bob{0%,100%{-webkit-transform:rotate(6deg)}50%{-webkit-transform:rotate(3deg) translateY(-8px)}}" +
  "@keyframes lc-bob{0%,100%{transform:rotate(6deg)}50%{transform:rotate(3deg) translateY(-8px)}}" +
  "@-webkit-keyframes lc-load{from{-webkit-transform:translateX(-100%)}to{-webkit-transform:translateX(260%)}}" +
  "@keyframes lc-load{from{transform:translateX(-100%)}to{transform:translateX(260%)}}" +
  "@-webkit-keyframes lc-blink{0%,100%{opacity:1}50%{opacity:.3}}@keyframes lc-blink{0%,100%{opacity:1}50%{opacity:.3}}" +
  "@media (max-width:760px){.fc-local-cinema .lc-msg{width:84%;left:8%}.fc-local-cinema #cinema-title{font-size:42px}.fc-local-cinema .lc-pop{width:90px;right:5%}.fc-local-cinema .lc-card{width:100px;height:75px}}" +
  "@media (prefers-reduced-motion:reduce){.fc-local-cinema .lc-card,.fc-local-cinema .lc-k{display:none}.fc-local-cinema .lc-pop,.fc-local-cinema .lc-bar i,.fc-local-cinema .lc-dot{-webkit-animation:none;animation:none}}";

export const LOCAL_CINEMA_WAITING_MARKUP =
  '<div class="fc-local-cinema">' +
  '<div aria-hidden="true"><div class="lc-beam"></div>' +
  '<div class="lc-card lc-video lc-c1"></div><div class="lc-card lc-photo lc-c2"></div>' +
  '<div class="lc-card lc-film lc-c3"></div><div class="lc-card lc-photo lc-c4"></div>' +
  '<span class="lc-k lc-k1"></span><span class="lc-k lc-k2"></span><span class="lc-k lc-k3"></span><span class="lc-k lc-k4"></span>' +
  '<div class="lc-shade"></div>' +
  '<div class="lc-pop"><span class="lc-pc lc-p1"></span><span class="lc-pc lc-p2"></span><span class="lc-pc lc-p3"></span><span class="lc-pc lc-p4"></span><span class="lc-pc lc-p5"></span><span class="lc-tub"></span></div>' +
  '<div class="lc-brand">frame<b>cast</b></div></div>' +
  '<div class="lc-msg" role="status" aria-live="polite">' +
  '<div class="lc-pill">PHONE CONNECTED<span class="lc-dot" aria-hidden="true"></span></div>' +
  '<h1 id="cinema-title">Preparing your next video\u2026</h1>' +
  '<p id="cinema-detail">Keep FrameCast open on your phone.</p>' +
  '<div class="lc-bar" aria-hidden="true"><i></i></div>' +
  "</div></div>";
