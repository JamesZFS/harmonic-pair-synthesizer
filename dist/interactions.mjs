// Reduce exact small-number ratios without changing their value.
export function reduceFraction(a,b){
 if(!Number.isFinite(a)||!Number.isFinite(b)||a<=0||b<=0)return null;
 let scale=1;
 while(scale<1e8&&(Math.abs(a*scale-Math.round(a*scale))>1e-8||Math.abs(b*scale-Math.round(b*scale))>1e-8))scale*=10;
 let x=Math.round(a*scale),y=Math.round(b*scale);
 if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x===0||y===0||Math.abs(x/y-a/b)>Math.abs(a/b)*1e-10)return [a,b];
 let p=x,q=y;while(q){[p,q]=[q,p%q]}return [x/p,y/p];
}
export function insideBarTrack(rect,x,y){
 const inset=Math.min(3,rect.width*.15),left=rect.left+inset,right=rect.right-inset,bottom=rect.bottom,top=rect.top;
 return x>=left&&x<=right&&y>=top&&y<=bottom;
}

// Keep the entire tooltip on one side of the line, including when text wraps.
export function spectrumTipPosition({x,y,width,height,viewportWidth,viewportHeight,gap=16}){
 const pad=8,left=Math.max(pad,Math.min(x+12,viewportWidth-width-pad));
 if(y-gap-height>=pad)return {left,top:y-gap-height};
 if(y+gap+height<=viewportHeight-pad)return {left,top:y+gap};
 return null; // A tiny visible viewport is preferable to obscuring the line.
}
