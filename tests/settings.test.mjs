import assert from 'node:assert/strict';
import {defaults,sanitize,linkedFrequencies} from '../dist/settings.mjs';
import {MIN,MAX,sign} from '../dist/math.mjs';
for(const ratio of [1/16,.5,1,1.25,1.5,2,16])for(const index of [0,1])for(const requested of [MIN,100,200,500,MAX]){
const [a,b]=linkedFrequencies(200,250,index,requested,ratio);
assert.ok(a>=MIN-1e-8&&a<=MAX+1e-8);assert.ok(b>=MIN-1e-8&&b<=MAX+1e-8);if(a>0)assert.ok(Math.abs(b/a-ratio)<1e-10);else assert.equal(b,0);
}
const s=defaults();s.axisScale='linear';s.axisLabels='both';s.view={lo:100,hi:2000};s.routing='split';s.mode='rms';s.ratioMode='cents';s.fixRatio=true;s.ratioSnap=true;s.tones[0].amps[0]=0;s.tones[0].preset='custom';s.tones[0].snap=true;s.tones[0].playing=true;
const loaded=sanitize(JSON.parse(JSON.stringify(s)));assert.equal(loaded.tones[0].playing,false);s.tones[0].playing=false;assert.deepEqual(loaded,s);
assert.deepEqual(sanitize(null),defaults());const corrupt=sanitize({axisScale:'oops',tones:[{f:Infinity,count:100,db:-100,amps:[NaN,-10,50]},{f:-10}],view:{lo:20,hi:-1}});assert.equal(corrupt.tones[0].count,32);assert.equal(corrupt.tones[0].db,-60);assert.equal(corrupt.tones[0].amps[1],0);assert.equal(corrupt.tones[0].amps[2],2);assert.equal(corrupt.tones[1].f,MIN);assert.equal(corrupt.axisScale,'log');assert.equal(sign('inverse',2),-1);
console.log('PASS: linked tuning limits in both directions, settings round-trip, stopped restore, invalid settings recovery, merged sawtooth phase.');

assert.equal(sanitize({panelHeight:0}).panelHeight,420);assert.equal(sanitize({panelHeight:100000}).panelHeight,1600);assert.equal(sanitize({panelHeight:Infinity}).panelHeight,800);
assert.equal(sanitize({}).panelHeightAuto,true);assert.equal(sanitize({panelHeight:905}).panelHeightAuto,false);assert.equal(sanitize({panelHeight:905,panelHeightAuto:true}).panelHeightAuto,true);
