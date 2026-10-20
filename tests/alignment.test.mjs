import assert from 'node:assert/strict';
import {defaults} from '../dist/settings.mjs';
import {MIN,MAX,preset} from '../dist/math.mjs';
import {snapFrequency,alignedPairs} from '../dist/alignment.mjs';
const tones=defaults().tones;
assert.deepEqual(alignedPairs(tones).map(p=>[p.n,p.m]),[[5,4],[10,8],[15,12]]);
let snap=snapFrequency(tones,1,251);assert.equal(snap.f,250);assert.equal(snap.match.n,4);assert.equal(snap.match.m,5);
assert.equal(snapFrequency(tones,0,201).f,200);
assert.equal(snapFrequency(tones,1,250*2**(15/1200),snap.match).f,250);
const released=snapFrequency(tones,1,250*2**(17/1200),snap.match);assert.notEqual(released.f,250);
const sine=defaults().tones;sine.forEach(s=>{s.amps=preset('sine',16)});assert.equal(alignedPairs(sine).length,0);assert.equal(snapFrequency(sine,1,251).match,null);assert.equal(snapFrequency(sine,1,200.3).f,200);
const zero=defaults().tones;zero[0].amps=zero[0].amps.map(()=>0);assert.equal(alignedPairs(zero).length,0);assert.equal(snapFrequency(zero,1,251,snap.match).match,null);
const square=defaults().tones;square.forEach(s=>s.amps=preset('square',16));assert.equal(alignedPairs(square).length,0);
tones[1].f=250.02;assert.equal(alignedPairs(tones).length,0);tones[1].f=250+1e-10;assert.equal(alignedPairs(tones).length,3);
for(const i of [0,1])for(const f of [MIN,MAX]){const result=snapFrequency(tones,i,f);assert.ok(result.f>=MIN&&result.f<=MAX);}
console.log('PASS: active harmonic coincidences, bidirectional snapping, capture/release hysteresis, sine/square/zero amplitudes, exact tolerance and range limits.');
