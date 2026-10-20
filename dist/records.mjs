import {defaults,sanitize} from './settings.mjs';
export const RECORDS_KEY='harmonic-lens.records.v1';
export function recordState(raw){const state=sanitize(raw);state.tones=state.tones.map(t=>({...t,amps:[...t.amps],playing:false,selected:-1}));state.guide=false;if(state.panelHeightAuto)state.panelHeight=800;state.ratioParts=[state.tones[1].f/state.tones[0].f,1];return state;}
export function recordSignature(name,state){return JSON.stringify({name,state:recordState(state)});}
export function draftRecord(state=defaults(),name='Untitled experiment'){return {id:globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),name,state:recordState(state),savedAt:null};}
export function readRecords(raw){if(!raw||!Array.isArray(raw.records))return {records:[],lastOpenedId:null};const seen=new Set(),records=[];for(const r of raw.records){if(!r||typeof r.id!=='string'||seen.has(r.id)||typeof r.name!=='string'||!r.state)continue;seen.add(r.id);records.push({id:r.id,name:r.name.slice(0,120)||'Untitled experiment',state:recordState(r.state),savedAt:typeof r.savedAt==='string'?r.savedAt:null});}const lastOpenedId=records.some(r=>r.id===raw.lastOpenedId)?raw.lastOpenedId:records[0]?.id??null;return {records,lastOpenedId};}
export function savedRecords(store,record,state,now=new Date().toISOString()){const saved={id:record.id,name:record.name.trim().slice(0,120)||'Untitled experiment',state:recordState(state),savedAt:now};return {records:[saved,...store.records.filter(r=>r.id!==saved.id)],lastOpenedId:saved.id};}

export function exportRecords(store,record,state,now=new Date().toISOString()){
 return {format:'harmonic-lens-records',version:1,exportedAt:now,...savedRecords(store,record,state,now)};
}
export function parseRecordImport(text){
 let raw;try{raw=JSON.parse(text);}catch{throw new Error('Choose a valid Harmonic Pair Synthesizer JSON export.');}
 if(!raw||raw.format!=='harmonic-lens-records'||raw.version!==1||!Array.isArray(raw.records))throw new Error('This file is not a supported Harmonic Pair Synthesizer records export.');
 if(raw.records.length>1000)throw new Error('Import up to 1,000 records at a time.');
 const ids=new Set();
 for(const r of raw.records){
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.name!=='string'||!r.state||!Array.isArray(r.state.tones)||r.state.tones.length!==2||!r.state.tones.every(t=>t&&Number.isFinite(t.f)&&Array.isArray(t.amps)&&t.amps.length>=1&&t.amps.length<=32&&t.amps.every(a=>Number.isFinite(a))))throw new Error('The file contains an invalid record. No records were imported.');
  ids.add(r.id);
 }
 return readRecords(raw);
}
export function mergeRecordImport(store,incoming,current,now=new Date().toISOString()){
 const records=[...store.records],ids=new Set([...records.map(r=>r.id),current.id]);
 const signatures=new Set(records.map(r=>recordSignature(r.name,r.state)));
 let added=0,skipped=0,copies=0;
 for(const r of incoming.records){
  const signature=recordSignature(r.name,r.state);
  if(signatures.has(signature)){skipped++;continue;}
  let id=r.id;if(ids.has(id)){copies++;do{id=draftRecord().id;}while(ids.has(id));}
  records.push({...r,id,savedAt:r.savedAt??now});ids.add(id);signatures.add(signature);added++;
 }
 return {store:{records,lastOpenedId:store.lastOpenedId},added,skipped,copies};
}
