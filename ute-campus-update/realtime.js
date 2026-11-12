'use strict';
// Kênh Supabase Realtime (broadcast): đồng bộ vị trí ~8 lần/giây + sự kiện game (bắn, đá bóng...).
// Không cần tạo bảng hay SQL mới. DB (campus_sync) vẫn lo chat và danh sách người trong phòng.
(()=>{
 const api=window.campusBridge,EVENTS=['pos','shot','hit','kill','kick','ballreset','pick'];
 const handlers={},peers=new Map(),finite=Number.isFinite,clamp=(v,m)=>Math.max(-m,Math.min(m,v));
 let ch=null,db=null,selfId=null,roster=[],rosterAt=0,muted=new Set(),live=false,extra={},raf=0,lastSend=0,lastSig='',lastFrame=0;
 const net={decorate:null};
 net.on=(t,f)=>{(handlers[t]=handlers[t]||[]).push(f)};
 function dispatch(t,p){
  if(!p||typeof p!=='object'||typeof p.from!=='string'||p.from===selfId)return;
  if(t==='pos')return onPos(p);
  for(const f of handlers[t]||[])try{f(p)}catch(e){console.error(e)}
 }
 function onPos(p){
  if(![p.x,p.z,p.yaw].every(finite))return;
  const e=p.e&&typeof p.e==='object'?p.e:{},x=clamp(p.x,190),z=clamp(p.z,190);
  let q=peers.get(p.from);if(!q){q={x,z,yaw:p.yaw};peers.set(p.from,q)}
  q.tx=x;q.tz=z;q.tyaw=p.yaw;q.t=Date.now();
  q.e={f:e.f?1:0,hp:Math.max(0,Math.min(100,+e.hp||0)),w:e.w?1:0};
 }
 net.emit=(t,payload)=>{
  if(!ch||!live)return false;
  try{const r=ch.send({type:'broadcast',event:t,payload:{...payload,from:selfId}});if(r&&r.catch)r.catch(()=>{})}catch{return false}
  return true;
 };
 function frame(now){
  raf=requestAnimationFrame(frame);
  const dt=Math.min((now-lastFrame)/1000,.1);lastFrame=now;
  const t=Date.now();
  if(!roster.length||t-rosterAt>8000){api.peers([]);return}
  const k=1-Math.exp(-dt*12),list=[];
  for(const p of roster){
   if(p.id===selfId||muted.has(p.id))continue;
   const q=peers.get(p.id),fresh=q&&t-q.t<4000;
   let x=p.x,z=p.z,yaw=p.yaw,e=null;
   if(fresh){
    q.x+=(q.tx-q.x)*k;q.z+=(q.tz-q.z)*k;
    let dy=q.tyaw-q.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));q.yaw+=dy*k;
    x=q.x;z=q.z;yaw=q.yaw;e=q.e;
   }
   list.push({id:p.id,name:net.decorate?net.decorate(p,e):p.name,color:p.color,x,z,yaw});
  }
  api.peers(list);
  if(live&&t-lastSend>=120){
   const s=api.position(),sig=[s.x.toFixed(2),s.z.toFixed(2),s.yaw.toFixed(2),JSON.stringify(extra)].join();
   if(sig!==lastSig||t-lastSend>1200){lastSig=sig;lastSend=t;net.emit('pos',{x:+s.x.toFixed(2),z:+s.z.toFixed(2),yaw:+s.yaw.toFixed(3),e:extra})}
  }
 }
 function start(client){
  if(ch||!client||!client.channel)return;
  db=client;ch=db.channel('ute-campus-room',{config:{broadcast:{self:false}}});
  for(const t of EVENTS)ch.on('broadcast',{event:t},m=>dispatch(t,m&&m.payload));
  ch.subscribe(s=>{live=s==='SUBSCRIBED'});
  cancelAnimationFrame(raf);lastFrame=performance.now();raf=requestAnimationFrame(frame);
 }
 net.roster=(client,players,self,mutedSet)=>{roster=players||[];selfId=self;muted=mutedSet||new Set();rosterAt=Date.now();start(client)};
 net.stop=()=>{try{if(ch&&db)db.removeChannel(ch)}catch{}ch=null;live=false;peers.clear();cancelAnimationFrame(raf);roster=[];lastSig=''};
 net.setExtra=o=>{extra=o};
 net.self=()=>selfId;net.live=()=>live;
 net.nameOf=id=>(roster.find(p=>p.id===id)||{}).name||'ai đó';
 window.campusNet=net;
})();
