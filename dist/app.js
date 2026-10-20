import {MIN,MAX,clamp,midi,hz,preset,sign,energy,scale,note,pitchPosition,pitchFrequency} from './math.mjs';
const $=s=>document.querySelector(s), colors=['#c47734','#3882aa'];
import {STORAGE_KEY,defaults,sanitize,linkedFrequencies} from './settings.mjs';
import {reduceFraction,insideBarTrack,spectrumTipPosition} from './interactions.mjs';
import {snapFrequency,alignedPairs} from './alignment.mjs';
import {RECORDS_KEY,recordState,recordSignature,draftRecord,readRecords,savedRecords,exportRecords,parseRecordImport,mergeRecordImport} from './records.mjs';
let storageFailure=false,recordStore={records:[],lastOpenedId:null},legacy=null;
try{const storedRecords=localStorage.getItem(RECORDS_KEY);recordStore=readRecords(JSON.parse(storedRecords));if(storedRecords===null)legacy=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch(e){storageFailure=true;}
let currentRecord=recordStore.records.find(r=>r.id===recordStore.lastOpenedId)??draftRecord(legacy??defaults(),legacy?'Imported setup':'Untitled experiment');
let restored=recordState(currentRecord.state);
const tones=restored.tones;
let {mode,routing,view,axisLabels,axisScale,panelHeight,panelHeightAuto,linkLevels,harmonicSnap,ratioSnap,fixRatio,ratioParts}=restored;
let lockedRatio=restored.lockedRatio,ctx,master,audio=[],audioGeneration=0,snapHeld=[null,null],activeEdit=null,editBaseline=null,editParts=null;
let savedSignature=currentRecord.savedAt?recordSignature(currentRecord.name,restored):null,dirty=!savedSignature,pendingEdits=false,recordsReady=false,heightControlsReady=false,pendingTransition=null,pendingDelete=null,sidebarOpen=true,draggedHarmonic=null;
function snapshot(){return recordState({tones,mode,routing,view,axisLabels,axisScale,panelHeight,panelHeightAuto,linkLevels,harmonicSnap,ratioSnap,fixRatio,lockedRatio,ratioParts});}
function updateDirty(){
 if(!recordsReady)return;dirty=pendingEdits||!savedSignature||recordSignature(currentRecord.name,snapshot())!==savedSignature;
 $('#saveStatus').textContent=dirty?'Unsaved changes':'Saved';$('#saveStatus').classList.toggle('unsaved',dirty);document.title=(dirty?'● ':'')+currentRecord.name+' — Harmonic Pair Synthesizer';
 const label=$('#currentRecordLabel');if(label)label.textContent=(currentRecord.name||'Untitled experiment')+(dirty?' *':'');
}
function persist(){updateDirty();}
const coord=f=>axisScale==='log'?Math.log2(f):f;
const frequency=v=>axisScale==='log'?2**v:v;
const panels=$('#tonePanels');
for(let i=0;i<2;i++){
const s=tones[i],l=i?'B':'A';const panel=document.createElement('section');panel.className='panel tone'+(i?' blue':'');panel.innerHTML=`<div class="tone-head"><div class="tone-title"><span class="tone-chip">${l}</span>Tone ${l}</div><button class="play" id="play${i}" aria-pressed="false">▶ Play <kbd>${i?'/':'Z'}</kbd></button></div><div class="tone-body"><div class="pitch-row"><label class="label" for="freq${i}">Fundamental</label><div class="pitch-value"><strong id="note${i}"></strong><input type="number" id="freq${i}" min="${MIN}" max="${MAX}" step="0.01" aria-label="Tone ${l} frequency in Hz"> <span class="small">Hz</span></div></div><input type="range" id="pitch${i}" min="${pitchPosition(MIN)}" max="${pitchPosition(MAX)}" step="0.001" aria-label="Tone ${l} pitch"><div class="range-labels"><span>C0</span><label><input type="checkbox" id="snap${i}"> Snap to semitones</label><span>C10</span></div><div class="level-row"><label class="label" for="level${i}">Level</label><input type="range" id="level${i}" min="-60" max="-1" step="0.1" value="-24"><output id="db${i}"></output></div><div class="editor-top"><label>TIMBRE PRESET<select id="preset${i}"><option value="sine">Pure sine</option><option value="uniform">Equal amplitude</option><option value="inverse" selected>Inverse · 1/n (sawtooth)</option><option value="inverse2">Inverse square · 1/n²</option><option value="triangle">Triangle</option><option value="square">Square</option><option value="custom" disabled>Custom</option></select></label><label>HARMONICS <input class="count" type="number" id="count${i}" min="1" max="32" value="16"></label></div><div class="bars" id="bars${i}" aria-label="Tone ${l} harmonic amplitude editor"></div><div class="editor-info" id="info${i}">Drag inside a bar · Click index to highlight</div><div class="fineprint">Bar height: Aₙ / A · Range 0–2 · H1 is the fundamental</div></div>`;panels.append(panel);
$(`#play${i}`).onclick=()=>toggle(i);
$(`#freq${i}`).onchange=e=>{const v=Number(e.target.value);setFrequency(i,e.target.value!==''&&Number.isFinite(v)&&v>=0?v:s.f);};
$(`#pitch${i}`).oninput=e=>setFrequency(i,pitchFrequency(+e.target.value));
$(`#pitch${i}`).onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();const el=e.currentTarget,r=el.getBoundingClientRect(),start=e.clientX,base=pitchPosition(s.f);el.setPointerCapture(e.pointerId);const move=v=>{const m=v.shiftKey?base+(v.clientX-start)/r.width*(pitchPosition(MAX)-pitchPosition(MIN))/10:pitchPosition(MIN)+clamp((v.clientX-r.left)/r.width,0,1)*(pitchPosition(MAX)-pitchPosition(MIN));setFrequency(i,pitchFrequency(m));};move(e);el.onpointermove=move;const end=()=>{el.onpointermove=null;el.onpointerup=null;el.onpointercancel=null};el.onpointerup=end;el.onpointercancel=end;};
$(`#snap${i}`).onchange=()=>setFrequency(i,s.f);
$(`#level${i}`).oninput=e=>{s.db=+e.target.value;if(linkLevels)tones[1-i].db=s.db;refresh();syncAudio()};
$(`#preset${i}`).onchange=e=>{s.preset=s.phase=e.target.value;s.amps=preset(s.preset,s.count);buildBars(i);refresh();syncAudio()};
$(`#count${i}`).onchange=e=>{const n=clamp(Math.round(+e.target.value)||1,1,32);s.count=n;if(s.selected>=n)s.selected=-1;e.target.value=n;if(s.preset==='custom')s.amps=Array.from({length:n},(_,k)=>s.amps[k]??0);else s.amps=preset(s.preset,n);buildBars(i);refresh();syncAudio()};
buildBars(i);
}
function setFrequency(i,f){
 if(!Number.isFinite(f))return;f=clamp(f,MIN,MAX);let match=null;
 if(harmonicSnap&&!fixRatio){const result=snapFrequency(tones,i,f,snapHeld[i]);f=result.f;match=result.match;}snapHeld[i]=match;snapHeld[1-i]=null;
 if(!match&&f>0&&$(`#snap${i}`).checked)f=clamp(hz(Math.round(midi(f))),MIN,MAX);
 const pair=linkedFrequencies(tones[0].f,tones[1].f,i,f,fixRatio?lockedRatio:0);tones.forEach((s,j)=>s.f=pair[j]);ratioParts=null;
 $('#ratioStatus').textContent=match?`Aligned · ${i?'B':'A'} H${match.n} = ${i?'A':'B'} H${match.m}`:'';refresh();syncAudio();
}

function bestFraction(r){let best={err:Infinity,a:1,b:1};for(let a=1;a<=16;a++)for(let b=1;b<=16;b++){const err=Math.abs(1200*Math.log2(r/(a/b)));if(err<best.err)best={err,a,b};}return reduceFraction(best.a,best.b);}

function setRatio(r,parts=null){if(tones[0].f===0){$('#ratioStatus').textContent='Set Tone A above 0 Hz to edit a ratio.';syncRatio();return;}if(!Number.isFinite(r)||r<=0){$('#ratioStatus').textContent='Enter a positive, finite ratio.';syncRatio();return;}const bounded=clamp(r,MIN/tones[0].f,MAX/tones[0].f);tones[1].f=tones[0].f*bounded;lockedRatio=bounded;ratioParts=Math.abs(bounded-r)<1e-12?parts:null;$('#ratioStatus').textContent=Math.abs(bounded-r)>1e-12?'Ratio limited to keep Tone B within C0–C10.':'';refresh();syncAudio();}
function syncRatio(){
 const available=tones.every(s=>s.f>0);
 for(const id of ['ratioNumDisplay','ratioDenDisplay','centsDisplay'])$('#'+id).disabled=!available;
 $('#ratioDrag').setAttribute('aria-disabled',!available);
 if(!available){$('#ratioApprox').hidden=true;$('#ratioNumDisplay').textContent='—';$('#ratioDenDisplay').textContent='—';$('#centsDisplay').textContent='—';$('#ratioDrag').textContent='—';$('#ratioDrag').removeAttribute('aria-valuenow');$('#ratioDrag').setAttribute('aria-valuetext','Unavailable at 0 Hz');return;}
 const r=tones[1].f/tones[0].f;
 if(!ratioParts||Math.abs(Math.log2(r/(ratioParts[0]/ratioParts[1])))>1e-8)ratioParts=[r,1];
 ratioParts=reduceFraction(...ratioParts);
 const displayParts=bestFraction(r);$('#ratioApprox').hidden=Math.abs(1200*Math.log2(r/(displayParts[0]/displayParts[1])))<.01;
 $('#ratioNumDisplay').textContent=String(displayParts[0]);$('#ratioDenDisplay').textContent=String(displayParts[1]);
 if(activeEdit!=='ratioNumerator')$('#ratioNumerator').value=displayParts[0];
 if(activeEdit!=='ratioDenominator')$('#ratioDenominator').value=displayParts[1];
 const c=1200*Math.log2(r);$('#centsDisplay').textContent=(c>0?'+':'')+c.toFixed(2);
 if(activeEdit!=='ratioCents')$('#ratioCents').value=Number(c.toFixed(6));
 $('#ratioDrag').textContent=r.toFixed(5);$('#ratioDrag').setAttribute('aria-valuemin',MIN/tones[0].f);$('#ratioDrag').setAttribute('aria-valuemax',MAX/tones[0].f);$('#ratioDrag').setAttribute('aria-valuenow',r);$('#ratioDrag').setAttribute('aria-valuetext',r.toFixed(5));
}
const inlineFields={ratioNumerator:'ratioNumDisplay',ratioDenominator:'ratioDenDisplay',ratioCents:'centsDisplay'};
function beginInlineEdit(id){if(!tones.every(s=>s.f>0))return;if(activeEdit)finishInlineEdit(true);activeEdit=id;const input=$('#'+id);editBaseline=Number(input.value);editParts=bestFraction(tones[1].f/tones[0].f);$('#'+inlineFields[id]).hidden=true;input.hidden=false;input.focus();input.select();}
function finishInlineEdit(commit){
 const id=activeEdit;if(!id)return;const input=$('#'+id),value=Number(input.value),valid=input.value.trim()!==''&&Number.isFinite(value)&&(id==='ratioCents'||value>0);
 activeEdit=null;pendingEdits=false;input.hidden=true;$('#'+inlineFields[id]).hidden=false;
 if(commit&&valid&&(id!=='ratioCents'||value!==editBaseline)){if(id==='ratioCents')setRatio(2**(value/1200));else{const parts=[...editParts];parts[id==='ratioNumerator'?0:1]=value;setRatio(parts[0]/parts[1],reduceFraction(...parts));}}
 else{if(commit&&!valid)$('#ratioStatus').textContent='Enter a valid '+(id==='ratioCents'?'cents value.':'positive ratio component.');syncRatio();}
}
function clearSelection(){if(!tones.some(s=>s.selected>=0))return;tones.forEach((s,i)=>{s.selected=-1;updateBars(i);$(`#info${i}`).textContent='Drag inside a bar · Click index to highlight';});draw();persist();}
function harmonicFromTarget(target){const node=target.closest?.('[data-i][data-n]');return node?{i:Number(node.dataset.i),n:Number(node.dataset.n)}:null;}
document.addEventListener('pointerdown',e=>{const harmonic=harmonicFromTarget(e.target);if(!harmonic||tones[harmonic.i]?.selected!==harmonic.n)clearSelection();},true);

function select(i,n){tones.forEach((s,j)=>{s.selected=j===i?n:-1;document.querySelectorAll(`#bars${j} .bar`).forEach((el,k)=>el.classList.toggle('selected',k===s.selected));if(j!==i)$(`#info${j}`).textContent='Drag inside a bar · Click index to highlight';});const s=tones[i];$(`#info${i}`).textContent=`H${n+1}${n===0?' (fundamental)':''} · ${((n+1)*s.f).toFixed(2)} Hz · Aₙ/A = ${s.amps[n].toFixed(3)}`;draw();persist()}
function buildBars(i){
 const s=tones[i],wrap=$(`#bars${i}`);wrap.replaceChildren();
 s.amps.forEach((a,n)=>{
  const bar=document.createElement('div');bar.className='bar';bar.dataset.i=i;bar.dataset.n=n;bar.tabIndex=0;bar.setAttribute('role','slider');bar.setAttribute('aria-label',`Tone ${i?'B':'A'}, harmonic ${n+1} amplitude ratio`);bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','2');bar.innerHTML=`<div class="bar-fill"></div><span>${n+1}</span>`;wrap.append(bar);
  bar.onfocus=()=>select(i,n);
  const edit=v=>{s.amps[n]=clamp(v,0,2);s.preset='custom';$(`#preset${i}`).value='custom';updateBars(i);select(i,n);syncAudio();persist()};
  bar.onkeydown=e=>{if(['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();edit(e.key==='Home'?0:e.key==='End'?2:s.amps[n]+(e.key==='ArrowUp'?1:-1)*(e.shiftKey?.001:.02))}if(e.key==='Escape'){e.preventDefault();clearSelection()}};
  const hover=e=>{bar.style.cursor=insideBarTrack(bar.getBoundingClientRect(),e.clientX,e.clientY)?'ns-resize':'pointer'};
  bar.onpointermove=hover;
  bar.onpointerdown=e=>{
   if(e.button!==0)return;e.preventDefault();bar.focus();select(i,n);
   const r=bar.getBoundingClientRect();if(!insideBarTrack(r,e.clientX,e.clientY))return;
   bar.setPointerCapture(e.pointerId);const start=e.clientY,base=s.amps[n];
   bar.onpointermove=v=>edit(base+(start-v.clientY)/r.height*(v.shiftKey?.2:2));
   const end=()=>{bar.onpointermove=hover;bar.onpointerup=null;bar.onpointercancel=null;};bar.onpointerup=end;bar.onpointercancel=end;
  };
 });
 // Gaps and the padding around each column select the nearest harmonic only.
 wrap.onpointerdown=e=>{if(e.target!==wrap||e.button!==0)return;const bars=[...wrap.children];if(!bars.length)return;let best=0,distance=Infinity;bars.forEach((b,n)=>{const r=b.getBoundingClientRect(),d=Math.abs(e.clientX-(r.left+r.right)/2);if(d<distance){distance=d;best=n}});select(i,best)};
 updateBars(i);
}
function updateBars(i){const s=tones[i];document.querySelectorAll(`#bars${i} .bar`).forEach((b,n)=>{b.querySelector('.bar-fill').style.height=(s.amps[n]*50)+'%';b.setAttribute('aria-valuenow',s.amps[n].toFixed(3));b.classList.toggle('selected',n===s.selected);b.classList.toggle('muted',(n+1)*s.f>=(ctx?.sampleRate??48000)/2);b.title=`H${n+1}: ${(s.f*(n+1)).toFixed(2)} Hz, amplitude ${s.amps[n].toFixed(3)}${b.classList.contains('muted')?' · Above output limit; silent':''}`})}
function refresh(){tones.forEach((s,i)=>{$(`#freq${i}`).value=s.f.toFixed(2);$(`#pitch${i}`).value=pitchPosition(s.f);$(`#note${i}`).textContent=note(s.f);$(`#db${i}`).textContent=s.db.toFixed(1)+' dB';$(`#level${i}`).value=s.db;$(`#readout${i}`).textContent=s.f.toFixed(2)+' Hz';$(`#indicator${i}`).classList.toggle('on',s.playing);const b=$(`#play${i}`);b.classList.toggle('active',s.playing);b.setAttribute('aria-pressed',s.playing);b.innerHTML=`${s.playing?'■ Stop':'▶ Play'} <kbd>${i?'/':'Z'}</kbd>`;updateBars(i);if(s.selected>=0)$(`#info${i}`).textContent=`H${s.selected+1} · ${(s.f*(s.selected+1)).toFixed(2)} Hz · Aₙ/A = ${s.amps[s.selected].toFixed(3)}`});syncRatio();$('#harmonicSnap').checked=harmonicSnap;$('#harmonicSnap').disabled=fixRatio;const any=tones.some(s=>s.playing);$('#playAll').innerHTML=`${any?'■ Stop all':'▶ Play all'} <kbd>Space</kbd>`;$('#playAll').classList.toggle('active',any);$('#playAll').setAttribute('aria-pressed',any);if(panelHeightAuto&&heightControlsReady)fitPanelHeight();draw();persist()}
async function ensureAudio(){if(!ctx){ctx=new AudioContext();master=ctx.createGain();master.gain.value=.5;master.connect(ctx.destination);audio=tones.map(()=>{const out=ctx.createGain(),pan=ctx.createStereoPanner();out.gain.value=0;out.connect(pan);pan.connect(master);const partials=Array.from({length:32},()=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';g.gain.value=0;o.connect(g);g.connect(out);o.start();return {o,g}});return {out,pan,partials}});ctx.onstatechange=()=>{if(ctx.state!=='running'){tones.forEach(s=>s.playing=false);refresh()}};}await ctx.resume();}
async function toggle(i){const generation=audioGeneration;try{await ensureAudio();if(generation!==audioGeneration)return;tones[i].playing=!tones[i].playing;refresh();syncAudio()}catch(e){$('#audioStatus').textContent='Audio could not start: '+e.message}}
async function toggleAll(){if(tones.some(s=>s.playing)){stop();return;}const generation=audioGeneration;try{await ensureAudio();if(generation!==audioGeneration)return;tones.forEach(s=>s.playing=true);refresh();syncAudio();}catch(e){$('#audioStatus').textContent='Audio could not start: '+e.message}}
function smooth(p,v){p.cancelAndHoldAtTime(ctx.currentTime);p.setTargetAtTime(v,ctx.currentTime,.018)}
function syncAudio(){if(!ctx)return;let bound=0;tones.forEach((s,i)=>{const a=audio[i],norm=scale(s.amps,s.f,ctx.sampleRate/2,mode),gain=10**(s.db/20)*norm;let sum=0;a.partials.forEach(({o,g},n)=>{const active=s.f>0&&n<s.count&&(n+1)*s.f<ctx.sampleRate/2,amp=active?s.amps[n]:0;sum+=amp;smooth(o.frequency,Math.min((n+1)*s.f,ctx.sampleRate/2-1));smooth(g.gain,amp*sign(s.phase,n+1))});smooth(a.out.gain,s.playing&&s.f>0?gain:0);smooth(a.pan.pan,routing==='split'?(i?1:-1):0);if(s.playing)bound+=sum*Math.abs(gain)});const headroom=Math.min(1,.85/Math.max(bound,1e-10));smooth(master.gain,headroom);$('#audioStatus').textContent=`${ctx.sampleRate/1000} kHz · ${routing==='split'?'Split stereo':'Mixed stereo'}${headroom<1?' · Shared headroom −'+(-20*Math.log10(headroom)).toFixed(1)+' dB':''}`;if(panelHeightAuto&&heightControlsReady)fitPanelHeight();}
$('#linkLevels').onchange=e=>{linkLevels=e.target.checked;if(linkLevels)tones[1].db=tones[0].db;refresh();syncAudio()};
$('#routing').onchange=e=>{routing=e.target.value;syncAudio();persist()};
$('#levelMode').onchange=e=>{const next=e.target.value;tones.forEach(s=>{const old=scale(s.amps,s.f,(ctx?.sampleRate??48000)/2,mode),nw=scale(s.amps,s.f,(ctx?.sampleRate??48000)/2,next);if(old>0&&nw>0)s.db=clamp(s.db+20*Math.log10(old/nw),-60,-1)});if(linkLevels)tones[1].db=tones[0].db;mode=next;refresh();syncAudio()};
function stop(){audioGeneration++;tones.forEach(s=>s.playing=false);refresh();syncAudio()}
$('#playAll').onclick=toggleAll;document.addEventListener('keydown',e=>{if(e.repeat||e.isComposing)return;if((e.metaKey||e.ctrlKey)&&!e.altKey){if(e.code==='KeyS'){e.preventDefault();if($('#unsavedDialog').open)resolveTransition('save');else saveRecord();return;}if(e.code==='KeyN'){e.preventDefault();requestTransition(newExperiment);return;}return;}if(e.altKey)return;if(e.target.isContentEditable||e.target.tagName==='TEXTAREA'||e.target.tagName==='INPUT'&&['text','search','email','url'].includes(e.target.type))return;if(e.code==='KeyZ'||e.code==='Slash'){e.preventDefault();toggle(e.code==='KeyZ'?0:1)}if(e.code==='KeyB'){e.preventDefault();routing=routing==='mixed'?'split':'mixed';$('#routing').value=routing;syncAudio();persist()}if(e.code==='Space'){e.preventDefault();toggleAll()}if(e.code==='Escape')stop()},true);window.addEventListener('pagehide',stop);window.addEventListener('beforeunload',e=>{updateDirty();if(dirty){e.preventDefault();e.returnValue='';}});
$('#helpButton').onclick=()=>{$('#guide').hidden=!$('#guide').hidden;$('#helpButton').setAttribute('aria-expanded',!$('#guide').hidden);persist()};
const svg=$('#spectrum'),NS='http://www.w3.org/2000/svg';let geom;
function el(tag,attrs,text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n}
function draw(){const W=svg.clientWidth||800,H=svg.clientHeight||430,L=axisLabels==='both'?113:68,T=44,B=H-23,R=W-18;geom={W,H,L,T,B,R};svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('aria-label',`Two harmonic spectra with a shared ${axisScale==='log'?'logarithmic':'linear'} frequency axis`);svg.replaceChildren();const y=f=>B-(coord(f)-view.lo)/(view.hi-view.lo)*(B-T);el('rect',{x:L,y:T,width:R-L,height:B-T,fill:'#fafbf8',rx:5});
const ticks=[];
if(axisLabels==='frequency'){
 const low=frequency(view.lo),high=frequency(view.hi);
 if(axisScale==='log'&&high/low>=2){for(let k=Math.floor(Math.log10(low));k<=Math.ceil(Math.log10(high));k++)for(const m of [1,2,5])ticks.push({f:m*10**k});}
 else{const target=(high-low)/Math.max(2,Math.floor((B-T)/45)),base=10**Math.floor(Math.log10(target)),step=[1,2,5,10].find(n=>n*base>=target)*base;for(let f=Math.ceil(low/step)*step;f<=high;f+=step)ticks.push({f});}
}else{for(let m=Math.floor(midi(Math.max(.01,frequency(view.lo))));m<=Math.ceil(midi(frequency(view.hi)));m++){if((midi(frequency(view.hi))-midi(Math.max(.01,frequency(view.lo))))>24&&[1,3,6,8,10].includes((m%12+12)%12))continue;ticks.push({f:hz(m),label:note(hz(m))});}}
let lastY=Infinity;for(const tick of ticks){const yy=y(tick.f);if(yy<T||yy>B||Math.abs(yy-lastY)<22)continue;lastY=yy;el('line',{x1:L,x2:R,y1:yy,y2:yy,stroke:'#dfe5da'});const freqText=tick.f>=1000?Number((tick.f/1000).toPrecision(4))+'k':Number(tick.f.toPrecision(4));const text=axisLabels==='notes'?tick.label:axisLabels==='both'?tick.label+' · '+freqText:freqText;el('text',{x:L-9,y:yy+3,'text-anchor':'end',fill:'#7b887a','font-size':10,'font-family':'monospace'},text);}
el('text',{x:12,y:18,fill:'#7b887a','font-size':9,'font-family':'system-ui'},axisLabels==='notes'?'Note ↑':axisLabels==='both'?'Note · Hz ↑':'Hz ↑');
const matches=alignedPairs(tones);if(!matches.length&&$('#ratioStatus').textContent.startsWith('Aligned ·'))$('#ratioStatus').textContent='';$('#alignmentCount').textContent=matches.length+' aligned '+(matches.length===1?'pair':'pairs');
for(const pair of matches){const ya=y(pair.fa),yb=y(pair.fb);if(ya<T||ya>B||yb<T||yb>B)continue;el('line',{x1:L+(R-L)*.49,x2:L+(R-L)*.51,y1:ya,y2:yb,stroke:'#728972','stroke-width':1.5,'stroke-dasharray':'2 2','data-alignment':'true','data-a':pair.n,'data-b':pair.m,cursor:'help'});}
for(let i=0;i<2;i++){const x1=L+(R-L)*(i?.51:.08),x2=L+(R-L)*(i?.92:.49);el('line',{x1:(x1+x2)/2,x2:(x1+x2)/2,y1:T,y2:B,stroke:'#e8ece3','stroke-dasharray':'3 5'});const label=el('text',{x:(x1+x2)/2,y:24,fill:colors[i],'font-size':11,'font-family':'system-ui','text-anchor':'middle',cursor:'ew-resize','data-tone':i},`TONE ${i?'B':'A'} · ${tones[i].f.toFixed(2)} Hz ↔`);const s=tones[i];s.amps.forEach((a,n)=>{const f=(n+1)*s.f;if(f<=0)return;const yy=y(f);if(yy<T||yy>B||a===0&&s.selected!==n)return;const chosen=s.selected===n,alpha=a===0?.06:.08+.92*Math.min(a/2,1);const line=el('line',{x1,x2,y1:yy,y2:yy,stroke:colors[i],'stroke-opacity':alpha,'stroke-width':chosen?6:2,'stroke-linecap':'round','data-i':i,'data-n':n});const hit=el('line',{x1,x2,y1:yy,y2:yy,stroke:'transparent','stroke-width':10,'data-i':i,'data-n':n,cursor:'ns-resize'});if(chosen||n===0)el('text',{x:i?x2+5:x1-5,y:yy+3,'text-anchor':i?'start':'end',fill:'#7b887a','font-size':9,'font-family':'monospace','data-i':i,'data-n':n,cursor:'ns-resize'},'H'+(n+1));});}
}
function zoom(factor,anchor=.5){const span=clamp((view.hi-view.lo)*factor,axisScale==='log'?.06:1,coord(48000)-coord(axisScale==='log'?.01:0)),point=view.lo+(view.hi-view.lo)*anchor;view.lo=point-span*anchor;view.hi=view.lo+span;limitView();draw();persist()}
function limitView(){const low=coord(axisScale==='log'?.01:0),high=coord(48000),span=Math.min(view.hi-view.lo,high-low);view.lo=clamp(view.lo,low,high-span);view.hi=view.lo+span;}
$('#zoomIn').onclick=()=>zoom(.7);$('#zoomOut').onclick=()=>zoom(1/.7);$('#resetView').onclick=()=>{view={lo:coord(Math.max(.01,Math.min(50,...tones.filter(s=>s.f>0).map(s=>s.f*.8)))),hi:coord(Math.max(2000,...tones.map(s=>s.f*s.count*1.12)))};limitView();draw();persist()};
svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect(),a=clamp((geom.B-(e.clientY-r.top))/(geom.B-geom.T),0,1);zoom(Math.exp(clamp(e.deltaY,-100,100)*.003),a)},{passive:false});
svg.onpointerdown=e=>{
 if(e.button!==0)return;const t=e.target,harmonic=harmonicFromTarget(t);
 if(harmonic){
  e.preventDefault();const {i,n}=harmonic,order=n+1;select(i,n);svg.setPointerCapture(e.pointerId);draggedHarmonic={i,n};showHarmonicTip(i,n,e);svg.style.cursor='ns-resize';
  let lastY=e.clientY,position=coord(tones[i].f*order);const span=view.hi-view.lo,height=geom.B-geom.T,dragScale=axisScale;
  const transform=f=>dragScale==='log'?Math.log2(f):f;
  const inverse=v=>dragScale==='log'?2**v:v;
  svg.onpointermove=v=>{position+=(lastY-v.clientY)/height*span*(v.shiftKey?.1:1);lastY=v.clientY;position=clamp(position,transform(MIN*order),transform(MAX*order));setFrequency(i,inverse(position)/order);showHarmonicTip(i,n,v);};
  const end=v=>{draggedHarmonic=null;svg.style.cursor='';if(v&&Number.isFinite(v.clientX))showHarmonicTip(i,n,v);svg.onpointermove=showTip;svg.onpointerup=null;svg.onpointercancel=null;};svg.onpointerup=end;svg.onpointercancel=end;return;
 }
 const tone=t.dataset.tone!==undefined?+t.dataset.tone:null,startY=e.clientY,startX=e.clientX,base={...view},pitch=tone!==null?pitchPosition(tones[tone].f):0;
 svg.setPointerCapture(e.pointerId);$('#tooltip').hidden=true;
 svg.onpointermove=v=>{if(tone!==null){setFrequency(tone,pitchFrequency(pitch+(v.clientX-startX)*(v.shiftKey?.001:.02)));return}const delta=(v.clientY-startY)/(geom.B-geom.T)*(base.hi-base.lo);view={lo:base.lo+delta,hi:base.hi+delta};limitView();draw();persist()};
 const end=()=>{svg.onpointermove=showTip;svg.onpointerup=null;svg.onpointercancel=null;};svg.onpointerup=end;svg.onpointercancel=end;
};
// A viewport-level overlay cannot be clipped by the spectrum panel on small screens.
document.body.append($('#tooltip'));
function placeSpectrumTip(text,f,e){
 const tip=$('#tooltip'),r=svg.getBoundingClientRect();
 const y=r.top+(geom.B-(coord(f)-view.lo)/(view.hi-view.lo)*(geom.B-geom.T))*r.height/geom.H;
 tip.textContent=text;tip.hidden=false;
 const position=spectrumTipPosition({x:e.clientX,y,width:tip.offsetWidth,height:tip.offsetHeight,viewportWidth:innerWidth,viewportHeight:innerHeight});
 if(!position||y<0||y>innerHeight){tip.hidden=true;return;}
 tip.style.left=position.left+'px';tip.style.top=position.top+'px';
}
function showHarmonicTip(i,n,e){const s=tones[i];placeSpectrumTip(`fᵢ ${(s.f*(n+1)).toFixed(2)} Hz · f₀ ${s.f.toFixed(2)} Hz`,s.f*(n+1),e);}
function showTip(e){const t=e.target,tip=$('#tooltip');if(t.dataset.alignment){const f=tones[0].f*Number(t.dataset.a);placeSpectrumTip(`Aligned · A H${t.dataset.a} = B H${t.dataset.b} · ${f.toFixed(2)} Hz`,f,e);return;}if(t.dataset.i===undefined){tip.hidden=true;return}const i=+t.dataset.i,n=+t.dataset.n,s=tones[i];placeSpectrumTip(`${i?'B':'A'} · H${n+1}${n===0?' fundamental':''} · ${(s.f*(n+1)).toFixed(2)} Hz · Aₙ/A ${s.amps[n].toFixed(3)}`,s.f*(n+1),e);}svg.onpointermove=showTip;svg.onpointerleave=()=>{if(!draggedHarmonic)$('#tooltip').hidden=true;};
addEventListener('scroll',()=>{$('#tooltip').hidden=true;},{capture:true,passive:true});
addEventListener('resize',()=>{$('#tooltip').hidden=true;});
// Safari gesture events supplement touch-action; single-finger scrolling stays native.
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,e=>e.preventDefault(),{passive:false});
for(const type of ['touchstart','touchmove'])document.addEventListener(type,e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});
document.addEventListener('contextmenu',e=>{if(e.pointerType==='touch'&&!e.target.closest('input,textarea,[contenteditable="true"]'))e.preventDefault();});
for(let i=0;i<2;i++){$(`#snap${i}`).checked=tones[i].snap;$(`#count${i}`).value=tones[i].count;$(`#preset${i}`).value=tones[i].preset;const old=$(`#snap${i}`).onchange;$(`#snap${i}`).onchange=()=>{tones[i].snap=$(`#snap${i}`).checked;old()};}
$('#linkLevels').checked=linkLevels;$('#routing').value=routing;$('#levelMode').value=mode;$('#axisLabels').value=axisLabels;$('#axisScale').value=axisScale;$('#ratioSnap').checked=ratioSnap;$('#fixRatio').checked=fixRatio;$('#guide').hidden=!restored.guide;$('#helpButton').setAttribute('aria-expanded',restored.guide);

$('#scaleHint').textContent=axisScale==='log'?'Log frequency':'Linear frequency';
$('#axisLabels').onchange=e=>{axisLabels=e.target.value;draw();persist()};
$('#axisScale').onchange=e=>{const lo=frequency(view.lo),hi=frequency(view.hi);axisScale=e.target.value;view={lo:coord(Math.max(axisScale==='log'?.01:0,lo)),hi:coord(hi)};$('#scaleHint').textContent=axisScale==='log'?'Log frequency':'Linear frequency';limitView();draw();persist()};
for(const [id,display] of Object.entries(inlineFields)){
 $('#'+display).onclick=()=>beginInlineEdit(id);
 $('#'+id).onblur=()=>{if(activeEdit===id)finishInlineEdit(true)};
 $('#'+id).onkeydown=e=>{if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();finishInlineEdit(e.key==='Enter');$('#'+display).focus();}};
}
const ratioDrag=$('#ratioDrag');
function dragRatio(r){let match=null;if(harmonicSnap&&!fixRatio){const result=snapFrequency(tones,1,clamp(tones[0].f*r,MIN,MAX),snapHeld[1]);snapHeld[1]=result.match;match=result.match;r=result.f/tones[0].f;}if(!match&&ratioSnap)r=2**(Math.round(12*Math.log2(r))/12);setRatio(r);}
ratioDrag.onpointerdown=e=>{
 if(e.button!==0||!tones.every(s=>s.f>0))return;e.preventDefault();ratioDrag.focus();ratioDrag.setPointerCapture(e.pointerId);let x=e.clientX,logRatio=Math.log2(tones[1].f/tones[0].f);
 ratioDrag.onpointermove=v=>{logRatio+=(v.clientX-x)*(v.shiftKey?.00005:.001);x=v.clientX;logRatio=clamp(logRatio,Math.log2(MIN/tones[0].f),Math.log2(MAX/tones[0].f));dragRatio(2**logRatio);};
 const end=()=>{ratioDrag.onpointermove=null;ratioDrag.onpointerup=null;ratioDrag.onpointercancel=null;};ratioDrag.onpointerup=end;ratioDrag.onpointercancel=end;
};
ratioDrag.onkeydown=e=>{if(!tones.every(s=>s.f>0))return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const direction=e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:1;dragRatio(tones[1].f/tones[0].f*2**(direction*(e.shiftKey?.1:1)/1200));}};
$('#ratioSnap').onchange=e=>{ratioSnap=e.target.checked;persist()};

$('#harmonicSnap').onchange=e=>{harmonicSnap=e.target.checked;snapHeld=[null,null];refresh()};
$('#fixRatio').onchange=e=>{snapHeld=[null,null];if(e.target.checked&&!tones.every(s=>s.f>0)){e.target.checked=false;$('#ratioStatus').textContent='Set both tones above 0 Hz before fixing their ratio.';return;}fixRatio=e.target.checked;if(fixRatio)lockedRatio=tones[1].f/tones[0].f;$('#ratioStatus').textContent='';refresh()};
function applyState(raw){
 finishInlineEdit(false);snapHeld=[null,null];draggedHarmonic=null;stop();const d=recordState(raw);
 tones.forEach((t,i)=>{Object.assign(t,d.tones[i]);$(`#snap${i}`).checked=t.snap;$(`#count${i}`).value=t.count;$(`#preset${i}`).value=t.preset;buildBars(i);$(`#info${i}`).textContent='Drag inside a bar · Click index to highlight';});
 ({mode,routing,view,axisLabels,axisScale,panelHeight,panelHeightAuto,linkLevels,harmonicSnap,ratioSnap,fixRatio,ratioParts}=d);lockedRatio=d.lockedRatio;applyPanelHeight(panelHeight);
 $('#linkLevels').checked=linkLevels;$('#routing').value=routing;$('#levelMode').value=mode;$('#axisLabels').value=axisLabels;$('#axisScale').value=axisScale;$('#ratioSnap').checked=ratioSnap;$('#fixRatio').checked=fixRatio;$('#guide').hidden=true;$('#helpButton').setAttribute('aria-expanded',false);$('#scaleHint').textContent=axisScale==='log'?'Log frequency':'Linear frequency';$('#ratioStatus').textContent='';$('#tooltip').hidden=true;pendingEdits=false;refresh();syncAudio();
}
function commitEdits(){document.activeElement?.blur?.();finishInlineEdit(true);pendingEdits=false;updateDirty();}
function renderRecords(){
 const list=$('#recordList');list.replaceChildren();const records=recordStore.records.some(r=>r.id===currentRecord.id)?recordStore.records:[currentRecord,...recordStore.records];
 for(const record of records){const row=document.createElement('div');row.className='record-row'+(record.id===currentRecord.id?' active':'');const open=document.createElement('button');open.className='record-open';const name=document.createElement('span');name.textContent=record.id===currentRecord.id?currentRecord.name:record.name;if(record.id===currentRecord.id)name.id='currentRecordLabel';const date=document.createElement('small');date.textContent=record.savedAt?'Saved '+new Date(record.savedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'Not saved yet';open.append(name,date);open.onclick=()=>{if(record.id!==currentRecord.id)requestTransition(()=>openExperiment(record.id));};const rename=document.createElement('button');rename.className='record-rename';rename.textContent='✎';rename.setAttribute('aria-label','Rename '+record.name);rename.onclick=()=>{const focus=()=>{$('#recordName').focus();$('#recordName').select();};if(record.id===currentRecord.id)focus();else requestTransition(()=>{openExperiment(record.id);focus();});};const remove=document.createElement('button');remove.className='record-delete';remove.setAttribute('aria-label','Delete '+record.name);remove.title='Delete record';remove.innerHTML='<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 5h14M7 5V2h6v3M5 5l1 13h8l1-13M8 8v7M12 8v7"/></svg>';remove.onclick=()=>requestDelete(record.id);row.append(open,rename,remove);list.append(row);}
 $('#recordName').value=currentRecord.name;updateDirty();
}
function saveRecord(){
 if($('#deleteDialog').open)return false;commitEdits();const next=savedRecords(recordStore,currentRecord,snapshot());
 try{localStorage.setItem(RECORDS_KEY,JSON.stringify(next));}catch(e){$('#storageStatus').textContent='Could not save: browser storage is unavailable or full.';$('#dialogError').textContent='Could not save. Free some browser storage and try again.';return false;}
 recordStore=next;currentRecord=recordStore.records[0];savedSignature=recordSignature(currentRecord.name,currentRecord.state);$('#storageStatus').textContent='';$('#dialogError').textContent='';renderRecords();return true;
}
function openExperiment(id){
 const record=recordStore.records.find(r=>r.id===id);if(!record)return;currentRecord=record;savedSignature=recordSignature(record.name,record.state);applyState(record.state);recordStore={...recordStore,lastOpenedId:id};
 try{localStorage.setItem(RECORDS_KEY,JSON.stringify(recordStore));}catch(e){$('#storageStatus').textContent='Could not remember the last opened record.';}
 renderRecords();
}
function newExperiment(){currentRecord=draftRecord();savedSignature=null;applyState(currentRecord.state);renderRecords();}
const recordTransfers=document.createElement('div');recordTransfers.className='record-transfers';
recordTransfers.innerHTML='<div class="record-transfer-buttons"><button id="exportRecords" title="Export all records, including the current unsaved setup">Export records</button><button id="importRecords" title="Merge records from another device">Import records</button></div><input id="recordImportFile" type="file" accept=".json,application/json" hidden><p id="recordTransferStatus" class="small" role="status" aria-live="polite"></p>';
$('#recordList').before(recordTransfers);
$('#exportRecords').onclick=()=>{
 const status=$('#recordTransferStatus');commitEdits();let url;
 try{
  const data=exportRecords(recordStore,currentRecord,snapshot());
  url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`harmonic-lens-records-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();
  status.textContent=`Exported ${data.records.length} record${data.records.length===1?'':'s'}, including the current setup.`;
 }catch{status.textContent='Could not export records. Please try again.';}
 finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);}
};
$('#importRecords').onclick=()=>$('#recordImportFile').click();
$('#recordImportFile').onchange=async e=>{
 const file=e.target.files[0],status=$('#recordTransferStatus');if(!file)return;
 const button=$('#importRecords');button.disabled=true;status.textContent='Importing…';
 try{
  if(file.size>10*1024*1024)throw new Error('Choose a records export smaller than 10 MB.');
  const incoming=parseRecordImport(await file.text());commitEdits();
  const result=mergeRecordImport(recordStore,incoming,{...currentRecord,state:snapshot()});
  if(result.added){
   try{localStorage.setItem(RECORDS_KEY,JSON.stringify(result.store));}catch{throw new Error('Could not import: browser storage is unavailable or full. Your records are unchanged.');}
   recordStore=result.store;renderRecords();
  }
  status.textContent=`Imported ${result.added} record${result.added===1?'':'s'} · ${result.skipped} already present${result.copies?` · ${result.copies} conflicting version${result.copies===1?'':'s'} kept as copies`:''}.`;
 }catch(error){status.textContent=error.message||'Could not import records. Your records are unchanged.';}
 finally{button.disabled=false;e.target.value='';}
};
function requestTransition(action){if($('#unsavedDialog').open||$('#deleteDialog').open)return;commitEdits();if(!dirty){action();return;}pendingTransition=action;$('#unsavedMessage').textContent=`“${currentRecord.name||'Untitled experiment'}” has unsaved changes. Save them before continuing?`;$('#dialogError').textContent='';$('#unsavedDialog').showModal();}
function resolveTransition(choice){if(choice==='save'&&!saveRecord())return;const action=pendingTransition;pendingTransition=null;$('#unsavedDialog').close();if(choice!=='cancel')action?.();}
function requestDelete(id){
 if($('#unsavedDialog').open||$('#deleteDialog').open)return;commitEdits();const record=id===currentRecord.id?currentRecord:recordStore.records.find(r=>r.id===id);if(!record)return;
 pendingDelete=id;$('#deleteMessage').textContent=`Delete “${record.name||'Untitled experiment'}”? This cannot be undone.`+(id===currentRecord.id&&dirty?' Its unsaved changes will also be discarded.':'');$('#deleteError').textContent='';$('#deleteDialog').showModal();
}
function deleteExperiment(){
 const id=pendingDelete;if(!id)return;const deletingCurrent=id===currentRecord.id,remaining=recordStore.records.filter(r=>r.id!==id);
 const lastOpenedId=deletingCurrent?remaining[0]?.id??null:remaining.some(r=>r.id===recordStore.lastOpenedId)?recordStore.lastOpenedId:remaining[0]?.id??null;
 const next={records:remaining,lastOpenedId};
 try{localStorage.setItem(RECORDS_KEY,JSON.stringify(next));}catch(e){$('#deleteError').textContent='Could not delete: browser storage is unavailable. Your records are unchanged.';return;}
 recordStore=next;pendingDelete=null;$('#deleteDialog').close();
 if(deletingCurrent){if(remaining.length){currentRecord=remaining[0];savedSignature=recordSignature(currentRecord.name,currentRecord.state);applyState(currentRecord.state);}else{newExperiment();return;}}
 renderRecords();
}
$('#confirmDelete').onclick=deleteExperiment;$('#cancelDelete').onclick=()=>{pendingDelete=null;$('#deleteDialog').close();};$('#deleteDialog').addEventListener('cancel',e=>{e.preventDefault();pendingDelete=null;$('#deleteDialog').close();});
function setSidebar(open){sidebarOpen=open;document.body.classList.toggle('sidebar-open',open);$('#sidebarToggle').setAttribute('aria-expanded',open);$('#sidebarBackdrop').hidden=!open||window.innerWidth>850;if(panelHeightAuto&&heightControlsReady)fitPanelHeight();}
$('#sidebarToggle').onclick=()=>setSidebar(!sidebarOpen);$('#sidebarClose').onclick=()=>setSidebar(false);$('#sidebarBackdrop').onclick=()=>setSidebar(false);window.addEventListener('resize',()=>setSidebar(sidebarOpen));
$('#saveRecord').onclick=saveRecord;$('#newRecord').onclick=()=>requestTransition(newExperiment);$('#recordName').oninput=e=>{currentRecord={...currentRecord,name:e.target.value.slice(0,120)};updateDirty();};$('#recordName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}};
$('#cancelTransition').onclick=()=>resolveTransition('cancel');$('#discardTransition').onclick=()=>resolveTransition('discard');$('#saveTransition').onclick=()=>resolveTransition('save');$('#unsavedDialog').addEventListener('cancel',e=>{e.preventDefault();resolveTransition('cancel');});
// Number inputs may contain an uncommitted edit when the tab is closed.
document.addEventListener('input',e=>{if(e.target.tagName==='INPUT'&&e.target.type==='number'){pendingEdits=true;updateDirty();}});document.addEventListener('change',e=>{if(e.target.tagName==='INPUT'&&e.target.type==='number'){pendingEdits=false;updateDirty();}});
const apple=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent);$('#saveShortcut').textContent=apple?'⌘S':'Ctrl+S';$('#newShortcut').textContent=apple?'⌘N':'Ctrl+N';
const panelResize=$('#panelResize');
function applyPanelHeight(value,minimum=420){panelHeight=clamp(Math.round(value),minimum,1600);document.documentElement.style.setProperty('--spectrum-panel-height',panelHeight+'px');panelResize.setAttribute('aria-valuemin',minimum);panelResize.setAttribute('aria-valuenow',panelHeight);$('#panelHeightReadout').textContent=panelHeight+' px';}
function minimumPanelHeight(){const output=$('.output'),previous={height:output.style.height,minHeight:output.style.minHeight,maxHeight:output.style.maxHeight};output.style.height='auto';output.style.minHeight='0px';output.style.maxHeight='none';const measured=Math.ceil(output.getBoundingClientRect().height)+1;Object.assign(output.style,previous);return clamp(measured,420,1600);}
function fitPanelHeight(){applyPanelHeight(minimumPanelHeight());}

panelResize.onpointerdown=e=>{
 if(e.button!==0)return;e.preventDefault();panelResize.focus();const minimum=420;panelResize.setAttribute('aria-valuemin',minimum);panelResize.setPointerCapture(e.pointerId);let lastY=e.clientY,desired=panelHeight;document.body.classList.toggle('resizing-panels',true);
 panelResize.onpointermove=v=>{desired=clamp(desired+(v.clientY-lastY)*(v.shiftKey?.1:1),minimum,1600);lastY=v.clientY;panelHeightAuto=false;applyPanelHeight(desired,minimum);persist();};
 const end=()=>{document.body.classList.toggle('resizing-panels',false);panelResize.onpointermove=null;panelResize.onpointerup=null;panelResize.onpointercancel=null;};panelResize.onpointerup=end;panelResize.onpointercancel=end;
};
panelResize.onkeydown=e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const minimum=420;panelResize.setAttribute('aria-valuemin',minimum);panelHeightAuto=false;applyPanelHeight(e.key==='Home'?minimum:e.key==='End'?1600:panelHeight+(e.key==='ArrowUp'?-1:1)*(e.shiftKey?1:10),minimum);persist();};
panelResize.ondblclick=()=>{panelHeightAuto=true;fitPanelHeight();persist();};
heightControlsReady=true;applyPanelHeight(panelHeight);
recordsReady=true;setSidebar(true);renderRecords();
if(storageFailure)$('#storageStatus').textContent='Some saved data could not be loaded. Save this setup as a record to keep it.';
let observedWidth=-1,observedHeight=-1;
new ResizeObserver(()=>{const width=svg.clientWidth,height=svg.clientHeight;if(width===observedWidth&&height===observedHeight)return;const widthChanged=width!==observedWidth;observedWidth=width;observedHeight=height;if(widthChanged&&panelHeightAuto)fitPanelHeight();draw();}).observe(svg);refresh();
