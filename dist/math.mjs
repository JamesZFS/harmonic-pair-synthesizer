export const MIN=16.351597831287414,MAX=16744.036179238312;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const midi=f=>69+12*Math.log2(f/440);
export const hz=m=>440*2**((m-69)/12);
export function preset(name,count){return Array.from({length:count},(_,i)=>{const n=i+1;if(name==='sine')return n===1?1:0;if(name==='uniform')return 1;if(name==='inverse'||name==='saw')return 1/n;if(name==='inverse2')return 1/n**2;if(name==='square')return n%2?1/n:0;if(name==='triangle')return n%2?1/n**2:0;return 0})}
export function sign(name,n){return (name==='saw'||name==='inverse')?(n%2?1:-1):name==='triangle'&&n%2?(-1)**((n-1)/2):1}
export function energy(amps,f,nyquist){if(f<=0)return 0;return amps.reduce((s,a,i)=>s+((i+1)*f<nyquist?a*a:0),0)}
export function scale(amps,f,nyquist,mode){const e=energy(amps,f,nyquist);return mode==='rms'?(e?Math.sqrt(2/e):0):1}
export function note(f){if(f<=0||!Number.isFinite(f))return '—';const m=midi(f),n=Math.round(m),names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];return names[((n%12)+12)%12]+(Math.floor(n/12)-1)}

export const pitchPosition=f=>Math.log2(1+Math.max(0,f));
export const pitchFrequency=p=>Math.max(0,2**p-1);
