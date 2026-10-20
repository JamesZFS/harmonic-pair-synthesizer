import assert from 'node:assert/strict';
import {reduceFraction,insideBarTrack,spectrumTipPosition} from '../dist/interactions.mjs';
assert.deepEqual(reduceFraction(10,8),[5,4]);assert.deepEqual(reduceFraction(1.5,.5),[3,1]);assert.equal(reduceFraction(0,2),null);
const r={left:10,right:30,width:20,top:10,bottom:110,height:100};
assert.equal(insideBarTrack(r,20,90),true);
assert.equal(insideBarTrack(r,20,30),true,'gray track permits editing');
assert.equal(insideBarTrack(r,11,90),false,'horizontal margin selects only');
assert.equal(insideBarTrack(r,20,0),false,'above-column margin selects only');
assert.equal(insideBarTrack(r,20,120),false,'harmonic index selects only');
assert.equal(insideBarTrack(r,20,109),true,'zero handle remains editable');
assert.equal(insideBarTrack({...r,right:16,width:6},13,90),true,'narrow columns retain editable width');
console.log('PASS: fraction reduction, full-column hit testing, margins, indices, zero handles, narrow columns.');
for(const viewportWidth of [240,320,390,768,1440])for(const height of [35,60,95])for(const y of [8,30,100,300,590]){
 const width=Math.min(350,viewportWidth-16),p=spectrumTipPosition({x:viewportWidth-4,y,width,height,viewportWidth,viewportHeight:600});
 assert.ok(p,'normal viewport has room on at least one side');
 assert.ok(p.top+height<=y-16||p.top>=y+16,'tooltip never intersects line');
 assert.ok(p.left>=8&&p.left+width<=viewportWidth-8,'horizontal viewport bounds');
 assert.ok(p.top>=8&&p.top+height<=592,'vertical viewport bounds');
}
assert.equal(spectrumTipPosition({x:100,y:50,width:180,height:70,viewportWidth:240,viewportHeight:100}),null);
console.log('PASS: tooltip avoids harmonic lines at narrow widths, wrapped heights and viewport edges.');
