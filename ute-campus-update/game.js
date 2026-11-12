'use strict';
// Mini-game trong khuôn viên: ⚽ đá bóng ở sân bóng + 🔫 súng trên mặt đất (nhặt, bắn, hồi sinh).
// Tên súng/hình dạng do mình tự đặt (low-poly), lấy cảm hứng theo nhóm súng trong game bắn súng sinh tồn.
(()=>{
 const api=window.campusBridge,net=window.campusNet,g=api.gfx,$=id=>document.getElementById(id);
 const now=()=>Date.now(),finite=Number.isFinite;
 const WEAPONS={
  pistol :{n:'Súng ngắn Đom Đóm',dmg:14,rate:3,  mag:12,range:34, pel:1,spread:.02, col:'#aeb8bd',len:1.0},
  smg    :{n:'Tiểu liên Chớp',   dmg:8, rate:11, mag:30,range:28, pel:1,spread:.07, col:'#d9a04c',len:1.3},
  ar     :{n:'Súng trường Bão',  dmg:15,rate:6,  mag:30,range:55, pel:1,spread:.035,col:'#639a5a',len:1.8},
  lmg    :{n:'Liên thanh Gấu',   dmg:12,rate:8,  mag:60,range:48, pel:1,spread:.06, col:'#92705a',len:2.0},
  shotgun:{n:'Shotgun Sấm',      dmg:9, rate:1.2,mag:6, range:17, pel:7,spread:.16, col:'#c2604d',len:1.6},
  sniper :{n:'Bắn tỉa Diều Hâu', dmg:75,rate:.8, mag:5, range:110,pel:1,spread:.003,col:'#5a7aa6',len:2.3}
 };
 const ORDER=['pistol','smg','ar','shotgun','sniper','lmg','pistol','smg','ar','shotgun','ar','smg'];
 const RESPAWN=25000,SAFE_R=26,K=1.5;
 const cen=a=>[a.reduce((s,v)=>s+v[0],0)/a.length,a.reduce((s,v)=>s+v[1],0)/a.length];
 const grow=(a,k)=>{const c=cen(a);return a.map(v=>[c[0]+(v[0]-c[0])*k,c[1]+(v[1]-c[1])*k])};
 function inside(x,z,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if(((a[1]>z)!==(b[1]>z))&&(x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]))c=!c}return c}

 // ---- sân bóng & điểm an toàn ----
 const court=[[405,450],[603,340],[703,480],[482,589]].map(p=>g.world(p)),courtWide=grow(court,1.1),center=cen(court);
 const safeC=g.world([525,803]),inSafe=(x,z)=>Math.hypot(x-safeC[0],z-safeC[1])<SAFE_R;

 // ---- điểm súng trên đất (cố định, ai cũng thấy giống nhau) ----
 const spawns=[];
 for(const poly of [[[579,714],[793,603],[1000,951],[920,1051],[698,899]],[[655,806],[765,747],[903,922],[819,981]],[[593,601],[745,521],[779,552],[626,640]]]){
  const w=poly.map(p=>g.world(p)),c=cen(w);
  for(const v of [...w.map(v=>[c[0]+(v[0]-c[0])*.55,c[1]+(v[1]-c[1])*.55]),c]){
   if(g.clear(v[0],v[1])&&!inSafe(v[0],v[1])&&Math.abs(v[0])<180&&Math.abs(v[1])<180)spawns.push({x:v[0],z:v[1]});
  }
 }
 spawns.forEach((s,i)=>s.w=ORDER[i%ORDER.length]);

 // ---- trạng thái ----
 let fight=false,ballOn=false,hp=100,weapon=null,ammo=0,reserve=0,reloadUntil=0,reloadTok=0,nextShot=0,alive=true,shield=0,kills=0,firing=false,nearItem=null,lastKick=0,toastUntil=0;
 const taken={},tracers=[];
 let ball={x:center[0],z:center[1],vx:0,vz:0,t:now()};
 const isTaken=i=>taken[i]&&now()-taken[i]<RESPAWN;
 const ballPos=t=>{const f=(1-Math.exp(-K*(t-ball.t)/1000))/K;return[ball.x+ball.vx*f,ball.z+ball.vz*f]};
 const say=s=>{const el=$('toast');if(!el)return;el.textContent=s;el.classList.add('show');toastUntil=now()+2600};

 // ---- bắn ----
 function reload(){
  if(!weapon||!alive)return;const w=WEAPONS[weapon],t=now();
  if(reserve<=0||ammo>=w.mag||t<reloadUntil)return;
  reloadUntil=t+1600;const tok=++reloadTok;say('Đang nạp đạn…');
  setTimeout(()=>{if(tok!==reloadTok||!weapon)return;const take=Math.min(w.mag-ammo,reserve);ammo+=take;reserve-=take},1600);
 }
 function fire(){
  const t=now();
  if(!fight||!alive||!weapon||t<nextShot||t<reloadUntil)return;
  const p=api.position();
  if(inSafe(p.x,p.z)){say('Khu vực cổng là khu an toàn, không bắn được');nextShot=t+800;return}
  const w=WEAPONS[weapon];
  if(ammo<=0){reload();nextShot=t+300;return}
  ammo--;nextShot=t+1000/w.rate;
  const base=Math.atan2(-Math.cos(p.yaw),-Math.sin(p.yaw)),d=[];
  for(let i=0;i<w.pel;i++)d.push(+(base+(Math.random()+Math.random()-1)*w.spread).toFixed(3));
  const m={x:+(p.x-Math.sin(p.yaw)*1.2).toFixed(2),z:+(p.z-Math.cos(p.yaw)*1.2).toFixed(2),d,w:weapon};
  onShot(m,true);net.emit('shot',m);
  if(ammo<=0)reload();
 }
 // điểm dừng của tia đạn (gặp tường thì dừng)
 function rayEnd(m,th,range){
  const dx=Math.cos(th),dz=Math.sin(th);let s=1;
  for(;s<range;s+=1)if(!g.clear(m.x+dx*s,m.z+dz*s))break;
  return[m.x+dx*Math.min(s,range),m.z+dz*Math.min(s,range)];
 }
 function hitCount(m,w){
  const p=api.position();if(inSafe(p.x,p.z))return 0;let hits=0;
  for(const th of m.d){
   const dx=Math.cos(th),dz=Math.sin(th),rx=p.x-m.x,rz=p.z-m.z,along=rx*dx+rz*dz;
   if(along<0||along>w.range||Math.abs(rx*dz-rz*dx)>.9)continue;
   let blocked=false;for(let s=1;s<along;s+=1)if(!g.clear(m.x+dx*s,m.z+dz*s)){blocked=true;break}
   if(!blocked)hits++;
  }
  return hits;
 }
 function onShot(m,mine){
  if(!m||!finite(m.x)||!finite(m.z)||!Array.isArray(m.d)||m.d.length>10||!m.d.every(finite)||!WEAPONS[m.w])return;
  const w=WEAPONS[m.w];
  for(const th of m.d)tracers.push({a:[m.x,m.z],b:rayEnd(m,th,w.range),t:now()});
  if(mine||!fight||!alive||now()<shield)return;
  const hits=hitCount(m,w);if(!hits)return;
  hp=Math.max(0,hp-hits*w.dmg);say('Bạn trúng đạn! ♥ '+Math.round(hp));
  net.emit('hit',{s:m.from,hp:Math.round(hp)});
  if(hp<=0)die(m.from);
 }
 function die(shooter){
  alive=false;weapon=null;ammo=0;reserve=0;firing=false;
  net.emit('kill',{s:shooter});say('Bạn bị '+net.nameOf(shooter)+' hạ gục! Hồi sinh sau 3 giây…');
  setTimeout(()=>{hp=100;alive=true;shield=now()+2500;api.gate();say('Đã hồi sinh ở cổng')},3000);
 }

 // ---- nhặt súng ----
 function pick(){
  if(nearItem==null||!fight||!alive)return;
  const s=spawns[nearItem],w=WEAPONS[s.w];
  weapon=s.w;ammo=w.mag;reserve=w.mag*2;reloadUntil=0;reloadTok++;
  taken[nearItem]=now();net.emit('pick',{i:nearItem});say('Đã nhặt '+w.n);nearItem=null;
 }

 // ---- bóng ----
 function kick(vx,vz){const bp=ballPos(now());ball={x:bp[0],z:bp[1],vx,vz,t:now()};net.emit('kick',{x:+bp[0].toFixed(2),z:+bp[1].toFixed(2),vx:+vx.toFixed(2),vz:+vz.toFixed(2)})}
 function ballTick(){
  if(!ballOn||api.mode()!=='walk'||!alive)return;
  const t=now(),p=api.position(),bp=ballPos(t);
  if(!inside(bp[0],bp[1],courtWide)){ball={x:center[0],z:center[1],vx:0,vz:0,t};net.emit('ballreset',{});say('Bóng ra ngoài, về giữa sân');return}
  const d=Math.hypot(bp[0]-p.x,bp[1]-p.z);
  if(d<1.8&&t-lastKick>260){
   lastKick=t;
   let dx=bp[0]-p.x,dz=bp[1]-p.z;
   if(d<.05){dx=-Math.sin(p.yaw);dz=-Math.cos(p.yaw)}else{dx/=d;dz/=d}
   const sp=api.running()?17:12;kick(dx*sp,dz*sp);
  }
 }

 // ---- sự kiện từ người khác ----
 net.on('shot',m=>onShot(m,false));
 net.on('hit',m=>{if(m&&m.s===net.self()){say('Trúng '+net.nameOf(m.from)+'! (còn '+(+m.hp||0)+' máu)')}});
 net.on('kill',m=>{if(m&&m.s===net.self()){kills++;say('Bạn hạ gục '+net.nameOf(m.from)+'! Tổng: '+kills)}});
 net.on('kick',m=>{if(m&&[m.x,m.z,m.vx,m.vz].every(finite)&&Math.hypot(m.vx,m.vz)<40)ball={x:m.x,z:m.z,vx:m.vx,vz:m.vz,t:now()}});
 net.on('ballreset',()=>{ball={x:center[0],z:center[1],vx:0,vz:0,t:now()}});
 net.on('pick',m=>{if(m&&Number.isInteger(m.i)&&spawns[m.i])taken[m.i]=now()});
 net.decorate=(p,e)=>e&&e.f?p.name.slice(0,13)+(e.w?' 🔫':' ')+'♥'+e.hp:p.name;

 // ---- vẽ (dùng bộ vẽ có sẵn của app.js) ----
 api.hook(()=>{
  const t=now(),p=api.position();
  spawns.forEach((s,i)=>{
   if(isTaken(i)||Math.hypot(p.x-s.x,p.z-s.z)>70)return;
   const w=WEAPONS[s.w],y=.7+.15*Math.sin(t/300+i);
   g.ground(s.x,s.z,2.6,2.6,'#f2d77a',.15);
   g.box(s.x,y,s.z,.35,.35,w.len,w.col);g.box(s.x,y-.4,s.z+w.len*.3,.3,.45,.3,'#4a4a45');g.box(s.x,0,s.z,.1,3.2,.1,w.col);
  });
  if(ballOn||t-ball.t<60000){const b=ballPos(t),h=Math.abs(Math.sin((t-ball.t)/260))*Math.min(1.2,Math.hypot(ball.vx,ball.vz)*.08)*Math.exp(-(t-ball.t)/900);g.ground(b[0],b[1],1.5,1.5,'#3c6445',.24);g.box(b[0],.2+h,b[1],1,1,1,'#f6f6f0')}
 });
 api.overlay(ctx=>{
  const t=now();
  ctx.save();
  ctx.lineCap='round';
  for(let i=tracers.length-1;i>=0;i--){
   const k=tracers[i],a=(t-k.t)/110;if(a>=1){tracers.splice(i,1);continue}
   const A=g.project([k.a[0],1.5,k.a[1]]),B=g.project([k.b[0],1.5,k.b[1]]);if(A.d<1||B.d<1)continue;
   ctx.strokeStyle='rgba(255,226,122,'+(1-a)+')';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(A.x,A.y);ctx.lineTo(B.x,B.y);ctx.stroke();
  }
  if(api.mode()==='walk'){
   const p=api.position();ctx.font='600 12px sans-serif';ctx.textAlign='center';
   spawns.forEach((s,i)=>{if(isTaken(i))return;const d=Math.hypot(p.x-s.x,p.z-s.z);if(d>14)return;const q=g.project([s.x,3.8,s.z]);if(q.d<2)return;ctx.fillStyle='#18362fdd';const txt=WEAPONS[s.w].n,w=ctx.measureText(txt).width+16;ctx.fillRect(q.x-w/2,q.y-16,w,22);ctx.fillStyle='#fff';ctx.fillText(txt,q.x,q.y)});
  }
  ctx.restore();
 });

 // ---- giao diện ----
 const hud=$('gameHud');
 function setBtn(el,show){if(el&&el.hidden===show)el.hidden=!show}
 function updateHud(){
  const walking=api.mode()==='walk';hud.hidden=!walking;if(!walking)return;
  const p=api.position(),onCourt=inside(p.x,p.z,courtWide);
  setBtn($('ballBtn'),onCourt||ballOn);
  $('ballBtn').classList.toggle('on',ballOn);$('ballBtn').textContent=ballOn?'⚽ Rời sân bóng':'⚽ Đá bóng';
  $('fightBtn').classList.toggle('on',fight);$('fightBtn').textContent='⚔ Đấu súng: '+(fight?'Bật':'Tắt');
  const w=weapon?WEAPONS[weapon]:null;
  $('hpBox').hidden=!fight;$('hpText').textContent='♥ '+Math.round(hp);$('hpBar').firstElementChild.style.width=hp+'%';
  $('wText').textContent=!alive?'Đã bị hạ gục…':w?(w.n+' · '+ammo+'/'+reserve+(now()<reloadUntil?' · đang nạp':'')):'Tay không · đi tới súng trên đất để nhặt';
  $('killText').textContent=kills?'Hạ gục: '+kills:'';
  setBtn($('fireBtn'),fight&&!!w&&alive);setBtn($('reloadBtn'),fight&&!!w&&alive);
  setBtn($('pickBtn'),nearItem!=null);if(nearItem!=null)$('pickBtn').textContent='Lượm '+WEAPONS[spawns[nearItem].w].n;
 }
 function tick(){
  const t=now();
  if(toastUntil&&t>toastUntil){toastUntil=0;$('toast').classList.remove('show')}
  nearItem=null;
  if(api.mode()==='walk'){
   const p=api.position();let best=1e9;
   if(fight&&alive)spawns.forEach((s,i)=>{if(isTaken(i))return;const d=Math.hypot(p.x-s.x,p.z-s.z);if(d<2.6&&d<best){best=d;nearItem=i}});
   if(firing||api.isDown(' ')||api.isDown('f'))fire();
   ballTick();
  }
  net.setExtra({f:fight?1:0,hp:Math.round(hp),w:weapon?1:0});
  updateHud();
 }
 $('fightBtn').onclick=()=>{fight=!fight;firing=false;say(fight?(net.live()?'Chế độ đấu súng BẬT: nhặt súng và bắn nhau!':'Đấu súng BẬT. Vào phòng chung để đấu với bạn bè nhé.'):'Đấu súng TẮT: bạn không bị bắn.')};
 $('ballBtn').onclick=()=>{ballOn=!ballOn;say(ballOn?'Vào sân: chạy vào bóng để sút (giữ chạy để sút mạnh)':'Đã rời sân bóng')};
 $('pickBtn').onclick=pick;$('reloadBtn').onclick=reload;
 const fb=$('fireBtn');fb.onpointerdown=e=>{firing=true;fb.setPointerCapture(e.pointerId)};fb.onpointerup=fb.onpointercancel=()=>{firing=false};
 addEventListener('keydown',e=>{
  if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||document.querySelector('dialog[open]'))return;
  const k=e.key.toLowerCase();if(k==='e')pick();else if(k==='r')reload();else if(k==='g')$('fightBtn').click();
 });
 setInterval(tick,33);
 window.campusGame={WEAPONS,spawns,inside,court,ballPos,state:()=>({fight,hp,weapon,ammo,reserve,kills,ball}),_test:{onShot,fire,pick,setFight:v=>{fight=v},setNear:i=>{nearItem=i}}};
})();
