import {MIN,MAX} from './math.mjs';
export const SNAP_CENTS=10,RELEASE_CENTS=16,ALIGN_CENTS=.01;
const cents=(a,b)=>Math.abs(1200*Math.log2(a/b));
// n is the moving tone's harmonic; m is the stationary tone's harmonic.
function candidate(tones,index,n,m){const moving=tones[index],fixed=tones[1-index];if(!(moving.amps[n-1]>0&&fixed.amps[m-1]>0)||n>moving.count||m>fixed.count)return null;const f=fixed.f*m/n;if(f<MIN||f>MAX||!Number.isFinite(f))return null;return {f,n,m};}
export function snapFrequency(tones,index,requested,held=null){
 if(!(requested>0))return {f:requested,match:null};
 if(held){const keep=candidate(tones,index,held.n,held.m);if(keep&&cents(requested,keep.f)<=RELEASE_CENTS)return {f:keep.f,match:keep};}
 const moving=tones[index],fixed=tones[1-index],maxA=Math.max(...moving.amps,1e-12),maxB=Math.max(...fixed.amps,1e-12);let best=null;
 for(let n=1;n<=moving.count;n++)for(let m=1;m<=fixed.count;m++){
  const c=candidate(tones,index,n,m);if(!c)continue;const distance=cents(requested,c.f);if(distance>SNAP_CENTS)continue;
  const strength=Math.sqrt(moving.amps[n-1]/maxA*fixed.amps[m-1]/maxB);
  const score=distance<1e-7?-1e6+Math.log2(n*m):distance+2*Math.log2(n*m)-3*strength;
  if(!best||score<best.score)best={...c,score};
 }
 return best?{f:best.f,match:{f:best.f,n:best.n,m:best.m}}:{f:requested,match:null};
}
export function alignedPairs(tones,tolerance=ALIGN_CENTS){
 const [a,b]=tones,result=[];if(!(a.f>0&&b.f>0))return result;
 for(let n=1;n<=a.count;n++){if(!(a.amps[n-1]>0))continue;for(let m=1;m<=b.count;m++){if(!(b.amps[m-1]>0))continue;const fa=a.f*n,fb=b.f*m;if(cents(fa,fb)<=tolerance)result.push({n,m,fa,fb});}}
 return result;
}
