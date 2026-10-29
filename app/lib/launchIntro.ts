/**
 * The opening animation ("Route"): a blue route is walked across the screen, turn by turn, and ends exactly where the logo's dot sits;
 * the route fades while the white "m" is drawn. About 2.6 s, once per app start, tap to skip.
 *
 * It is server-rendered markup plus one small inline script, so it is on screen from the first paint and does not wait for the app to
 * load or hydrate; the app loads underneath it meanwhile. Nothing here waits on, or delays, any data. With reduced motion the logo just
 * shows briefly and fades. Without JavaScript it stays hidden.
 */
const S0 = 0.78;
const TX0 = 195 - (297 * S0) / 2;
const TY0 = 381 - (204 * S0) / 2;
const DOT_X = +(TX0 + 260.4 * S0).toFixed(2);
const DOT_Y = +(TY0 + 167 * S0).toFixed(2);
const ROUTE = `M24 752V690Q24 668 46 668H120Q142 668 142 646V590Q142 568 164 568H230Q252 568 252 546V470Q252 448 274 448H${DOT_X}V${DOT_Y}`;
const MARK = "M33.5 169.5V89.4A56.625 56.625 0 0 1 146.75 89.4V169.5V89.4A56.825 56.825 0 0 1 260.4 89.4V105.25";

export const LAUNCH_INTRO_HTML = `
<div id="launch" aria-hidden="true" hidden>
<svg viewBox="0 0 390 800" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" style="overflow:visible;display:block">
<defs><filter id="lb" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="6"/></filter>
<radialGradient id="lg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#7f95ff" stop-opacity=".5"/><stop offset="1" stop-color="#4f6ef7" stop-opacity="0"/></radialGradient></defs>
<g id="lgrid" stroke="#2a3050" stroke-width="2" fill="none" opacity="0"><path d="M-400 120H800M-400 250H800M-400 380H800M-400 510H800M-400 640H800M-400 760H800M-400 -10H800M-400 890H800"/><path d="M40 -400V1200M140 -400V1200M250 -400V1200M350 -400V1200M-60 -400V1200M450 -400V1200"/></g>
<circle id="lglow" cx="195" cy="381" r="190" fill="url(#lg)" opacity="0"/>
<g id="lroute" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0"><path id="lrc" d="${ROUTE}" stroke="#fff" stroke-width="12" opacity=".9"/><path id="lrl" d="${ROUTE}" stroke="#4f6ef7" stroke-width="7"/></g>
<g transform="translate(${TX0.toFixed(2)} ${TY0.toFixed(2)}) scale(${S0})"><path id="lmark" d="${MARK}" fill="none" stroke="#fff" stroke-width="46.1" stroke-linecap="round" stroke-linejoin="round" opacity="0"/><circle id="ldot" cx="260.4" cy="167" r="0" fill="#fff"/><circle id="lring" cx="260.4" cy="167" r="25.7" fill="none" stroke="#fff" stroke-width="2.5" opacity="0"/></g>
<g id="lrun" opacity="0"><circle r="20" fill="#4f6ef7" opacity=".7" filter="url(#lb)"/><circle r="11" fill="#fff"/><circle r="7.5" fill="#4f6ef7"/></g>
</svg>
</div>`;

export const LAUNCH_INTRO_CSS = `#launch{position:fixed;inset:0;z-index:3000;background:#000;display:block;touch-action:manipulation;transition:opacity .38s ease,visibility 0s linear .38s}#launch[hidden]{display:none}#launch.off{opacity:0;visibility:hidden;pointer-events:none}`;

export const LAUNCH_INTRO_SCRIPT = `(function(){
var el=document.getElementById("launch");if(!el)return;
try{if(sessionStorage.getItem("move.intro")){return}sessionStorage.setItem("move.intro","1")}catch(e){}
var reduce=false;try{reduce=matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){}
el.hidden=false;
var $=function(i){return document.getElementById(i)};
var clamp=function(x,a,b){return Math.min(b,Math.max(a,x))},seg=function(t,a,b){return clamp((t-a)/(b-a),0,1)},lerp=function(a,b,k){return a+(b-a)*k};
var oc=function(k){return 1-Math.pow(1-k,3)},ios=function(k){return -(Math.cos(Math.PI*k)-1)/2},ioc=function(k){return k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2};
var spring=function(k,d,f){return k<=0?0:k>=1?1:1-Math.exp(-d*k)*Math.cos(f*k)};
var mark=$("lmark"),route=$("lrl"),ML=mark.getTotalLength(),RL=route.getTotalLength();
mark.setAttribute("stroke-dasharray",ML+" "+ML);$("lrl").setAttribute("stroke-dasharray",RL+" "+RL);$("lrc").setAttribute("stroke-dasharray",RL+" "+RL);
var D=${DOT_X},E=${DOT_Y},END=2.55,FADE=2.2,done=false,t0=performance.now(),skipAt=null;
function paint(t){
 $("lgrid").setAttribute("opacity",(.5*seg(t,0,.4)*(1-seg(t,1.7,2.3))).toFixed(3));
 var k=ios(seg(t,.12,1.3)),pt=route.getPointAtLength(k*RL);
 $("lrl").setAttribute("stroke-dashoffset",(RL*(1-k)).toFixed(1));$("lrc").setAttribute("stroke-dashoffset",(RL*(1-k)).toFixed(1));
 $("lroute").setAttribute("opacity",(seg(t,.12,.25)*(1-seg(t,1.75,2.25))).toFixed(3));
 var run=$("lrun");run.setAttribute("opacity",(seg(t,.12,.25)*(1-seg(t,1.3,1.4))).toFixed(3));run.setAttribute("transform","translate("+pt.x.toFixed(1)+" "+pt.y.toFixed(1)+")");
 var arr=seg(t,1.3,1.6);$("ldot").setAttribute("r",(25.7*spring(arr,6,12)).toFixed(2));
 var rk=seg(t,1.35,2.0);$("lring").setAttribute("r",lerp(25.7,95,oc(rk)).toFixed(1));$("lring").setAttribute("opacity",rk>0&&rk<1?(.5*(1-rk)).toFixed(3):0);
 var p=ioc(seg(t,1.45,2.1));mark.setAttribute("stroke-dashoffset",(ML*(1-p)).toFixed(1));mark.setAttribute("opacity",t>1.45?1:0);
 $("lglow").setAttribute("opacity",(.3*seg(t,1.3,2.0)).toFixed(3));
}
function finish(){if(done)return;done=true;el.classList.add("off");setTimeout(function(){el.hidden=true},500)}
el.addEventListener("click",function(){if(skipAt===null){skipAt=performance.now();paint(FADE);finish()}});
if(reduce){paint(FADE);setTimeout(finish,700);return}
(function tick(now){
 if(done)return;
 var t=(now-t0)/1000;
 paint(Math.min(t,FADE));
 if(t>=END){finish();return}
 requestAnimationFrame(tick)
})(t0);
})();`;
