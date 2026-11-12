'use strict';
(()=>{
 const el=id=>document.getElementById(id),api=window.campusBridge;
 const safeRead=k=>{try{return localStorage.getItem(k)}catch{return null}},save=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
 let profile;try{profile=JSON.parse(safeRead('ute-profile'))}catch{}profile=profile||{name:'',color:'#267c65'};
 el('nickname').value=profile.name;el('shirt').value=profile.color;api.color(profile.color);
 let db=null,active=false,busy=false,timer=null,pending=null,lastSent=0,muted=new Set(),seen=new Set();
 const status=t=>el('socialStatus').textContent=t;
 function remember(){profile={name:el('nickname').value.trim().slice(0,24),color:el('shirt').value};save('ute-profile',JSON.stringify(profile));api.color(profile.color)}
 el('shirt').oninput=()=>{api.color(el('shirt').value)};
 el('saveLook').onclick=()=>{remember();leave();el('socialDialog').close();api.walk()};
 el('openSocial').onclick=()=>el('socialDialog').showModal();
 el('closeSocial').onclick=()=>el('socialDialog').close();
 el('chatToggle').onclick=()=>{el('chatPanel').hidden=!el('chatPanel').hidden};
 el('hideChat').onclick=()=>el('chatPanel').hidden=true;
 el('joinRoom').onclick=async()=>{
  if(active){el('socialDialog').close();el('chatPanel').hidden=false;return}remember();if(!profile.name){status('Nhập tên hiển thị từ 1–24 ký tự.');return}
  const cfg=window.CAMPUS_SOCIAL_CONFIG;
  if(!cfg?.url||!cfg?.key){status('Phòng chung chưa được kết nối máy chủ. Bạn vẫn có thể đổi màu và đi dạo một mình.');return}
  el('joinRoom').disabled=true;status('Đang kết nối…');
  try{db=db||supabase.createClient(cfg.url,cfg.key,{auth:{storage:sessionStorage}});let {data,error}=await db.auth.getSession();if(error)throw error;if(!data.session){let r=await db.auth.signInAnonymously();if(r.error)throw r.error}
   active=true;await sync(true);if(!active)return;el('socialDialog').close();el('chatPanel').hidden=false;el('chatToggle').hidden=false;el('leaveRoom').hidden=false;api.walk();timer=setInterval(()=>sync(),1500);
  }catch(e){active=false;status(e.message?.includes('ROOM_FULL')?'Phòng đã đủ 40 người, bạn thử lại sau nhé.':'Chưa kết nối được phòng chung. Kiểm tra mạng rồi thử lại.');}finally{el('joinRoom').disabled=false}
 };
 async function sync(initial=false){if(busy||!active)return;busy=true;const sending=pending;pending=null;
  try{const p=api.position();let {data,error}=await db.rpc('campus_sync',{p_name:profile.name,p_color:profile.color,p_x:p.x,p_z:p.z,p_yaw:p.yaw,p_message:sending});if(error)throw error;
   if(!active)return;status('Đã kết nối phòng chung');el('onlineBadge').textContent=data.players.length+' người trong phòng';
   window.campusNet?campusNet.roster(db,data.players,data.self,muted):api.peers(data.players.filter(p=>p.id!==data.self&&!muted.has(p.id)));el('people').replaceChildren();
   for(const p of data.players){const b=document.createElement('button');b.textContent=p.name+(p.id===data.self?' (bạn)':muted.has(p.id)?' · Bỏ ẩn':' · Ẩn');b.disabled=p.id===data.self;b.onclick=()=>{muted.has(p.id)?muted.delete(p.id):muted.add(p.id);seen.clear();el('chatMessages').replaceChildren();sync()};el('people').append(b)}
   const log=el('chatMessages'),atBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;for(const m of data.messages){if(seen.has(m.id)||muted.has(m.sender))continue;seen.add(m.id);const row=document.createElement('div'),name=document.createElement('b'),time=document.createElement('time'),body=document.createElement('span');name.textContent=m.name;name.style.color=m.color;time.textContent=new Date(m.created_at).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});body.textContent=m.body;row.append(name,time,body);el('chatMessages').append(row)}
   while(el('chatMessages').children.length>80)el('chatMessages').firstChild.remove();seen=new Set(data.messages.map(m=>m.id));if(sending||initial||atBottom)el('chatMessages').scrollTop=el('chatMessages').scrollHeight;
   el('chatState').textContent='Phòng chung · Tin nhắn lưu tối đa 24 giờ';
  }catch(e){if(sending&&!el('chatInput').value)el('chatInput').value=sending;if(initial){active=false;throw e}api.peers([]);el('onlineBadge').textContent='Đang kết nối lại…';el('chatState').textContent=sending?'Gửi chưa thành công. Bạn hãy gửi lại.':'Mất kết nối, đang thử lại…';}
  finally{busy=false}
 }
 el('chatForm').onsubmit=e=>{e.preventDefault();if(!active||pending||Date.now()-lastSent<3200)return;const txt=el('chatInput').value.trim();if(!txt)return;pending=txt.slice(0,240);el('chatInput').value='';lastSent=Date.now();el('chatState').textContent='Đang gửi…'};
 async function leave(){active=false;clearInterval(timer);if(window.campusNet)campusNet.stop();api.peers([]);el('onlineBadge').textContent='Chế độ một mình';el('chatPanel').hidden=true;el('chatToggle').hidden=true;el('leaveRoom').hidden=true;status('Đã rời phòng chung');if(db)await db.rpc('campus_leave')};el('leaveRoom').onclick=leave;el('start').addEventListener('click',leave);
 document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>{el('chatInput').value=b.dataset.chat;el('chatInput').focus()});
 addEventListener('pagehide',()=>{if(active&&db)db.rpc('campus_leave')});
 el('namesToggle').onclick=()=>{document.body.classList.toggle('namedLabels');el('namesToggle').textContent=document.body.classList.contains('namedLabels')?'Nhãn: tên khu':'Nhãn: số khối'};
 el('guideToggle').onclick=()=>el('guideDialog').showModal();el('closeGuide').onclick=()=>el('guideDialog').close();
 el('homeGate').onclick=()=>api.gate();
 el('favorite').onclick=()=>{const p=api.selected();if(!p)return;let ids;try{ids=JSON.parse(safeRead('ute-favorites')||'[]')}catch{ids=[]}ids=ids.includes(p.id)?ids.filter(i=>i!==p.id):[...ids,p.id];save('ute-favorites',JSON.stringify(ids));renderSaved()};
 function renderSaved(){let ids;try{ids=JSON.parse(safeRead('ute-favorites')||'[]')}catch{ids=[]}el('savedPlaces').replaceChildren();for(const id of ids){const p=api.places()[id];if(!p)continue;let b=document.createElement('button');b.textContent='★ '+p.name;b.onclick=()=>{api.select(id);el('guideDialog').close()};el('savedPlaces').append(b)}if(!ids.length)el('savedPlaces').textContent='Chọn một địa điểm, bấm “Lưu / bỏ lưu” để thêm vào đây.'}renderSaved();
})();
