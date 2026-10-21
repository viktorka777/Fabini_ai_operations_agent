const b=$input.first().json.body||{};
const st=$getWorkflowStaticData('global');
if(b.tool==='reset_demo')for(const k of Object.keys(st))delete st[k];
if(!st.orders){
 st.orders={};
 for(const id of ['100245','100246','100247','100248']){
  const paid=id!=='100246';
  st.orders[id]={
   order:{order_id:id,status:paid?'paid':'pending_payment',total_czk:1290,items:['Testovací pánev']},
   payment:{order_id:id,status:paid?'paid':'pending'},
   fulfillment:{order_id:id,status:id==='100246'?'awaiting_payment':id==='100248'?'stock_hold':'not_received',shipped:false,blocked_reason:id==='100246'?'Platba nebyla dokončena':id==='100248'?'Nedostatek zásoby':'Přenos ERP → WMS selhal'},
   sync_logs:{order_id:id,entries:id==='100246'?[]:[{status:id==='100248'?'success':'failed',error:id==='100248'?null:'WMS_TIMEOUT',message:id==='100248'?'Přenos dokončen':'WMS neodpovědělo včas'}]},version:1
  };
 }
}
st.proposals=st.proposals||{};st.runs=st.runs||{};st.tickets=st.tickets||[];st.audit=st.audit||[];
const now=Date.now(),tool=String(b.tool||''),id=String(b.order_id||'');
const audit=(event,data)=>{st.audit.push({at:new Date().toISOString(),event,...data});st.audit=st.audit.slice(-1000);};
const out=(status,payload)=>{
 const run=st.runs[String(b.run_id||'')];
 if(run&&status===200&&['get_order','get_payment','get_fulfillment','get_sync_logs'].includes(tool)){
  run.verified=run.verified||{};run.verified[tool]=true;
  run.observations=run.observations||{};run.observations[tool]=JSON.parse(JSON.stringify(payload));
 }
 if(tool!=='get_audit')audit('tool_result',{tool,order_id:id,run_id:String(b.run_id||''),status,result:payload});
 return [{json:{status,payload}}];
};
audit('tool_call',{tool,order_id:id,run_id:String(b.run_id||''),decision:b.decision||null});
for(const [key,r] of Object.entries(st.runs))if(now-r.at>3600000)delete st.runs[key];
for(const [key,p] of Object.entries(st.proposals))if(now-p.created_at>86400000)delete st.proposals[key];
const actions=['retry_sync','create_ticket'];
const publicTools=['get_order','get_payment','get_fulfillment','get_sync_logs',...actions];
const confirmedSyncFailure=(logs)=>{
 if(!logs||!Array.isArray(logs.entries)||!logs.entries.length)return false;
 const latest=logs.entries[0];
 return !!latest&&latest.status==='failed'&&typeof latest.error==='string'&&latest.error.trim().length>0;
};
if(tool==='reset_demo')return out(200,{status:'reset',message:'Pouze vlastní testovací data byla obnovena.'});
if(tool==='inspect_proposal'||tool==='execute_approved'){
 const p=st.proposals[String(b.proposal_id||'')];
 if(!p)return out(404,{status:'blocked',error:'proposal_not_found'});
 if(!['approve','deny'].includes(b.decision))return out(422,{status:'blocked',error:'invalid_decision'});
 if(p.state!=='pending')return out(409,{status:'blocked',error:'proposal_already_consumed',state:p.state});
 if(p.expires_at<=now)return out(410,{status:'blocked',error:'approval_expired'});
 const rec=st.orders[p.order_id];
 if(b.decision==='approve'&&rec.version!==p.version)return out(409,{status:'blocked',error:'state_changed_since_analysis'});
 if(b.decision==='approve'&&p.action==='retry_sync'&&(p.sync_failure_confirmed!==true||!confirmedSyncFailure(rec.sync_logs)))return out(409,{status:'blocked',error:'sync_failure_not_confirmed'});
 if(tool==='inspect_proposal')return out(200,{status:'valid',proposal:{id:p.id,order_id:p.order_id,action:p.action,arguments:p.arguments,expires_at:p.expires_at},decision:b.decision});
 if(b.lock_granted!==true)return out(403,{status:'blocked',error:'approval_lock_required'});
 if(b.decision==='deny'){
  p.state='denied';audit('approval_denied',{proposal_id:p.id});
  return out(200,{status:'denied',proposal_id:p.id,actions_performed:[],message:'Žádná změna nebyla provedena.'});
 }
 p.state='executing';audit('approval_granted',{proposal_id:p.id,action:p.action,arguments:p.arguments});
 let result;
 if(p.action==='retry_sync'){
  if(p.order_id==='100247'){
   p.state='failed';return out(503,{status:'failed',error:'wms_unavailable',proposal_id:p.id,actions_performed:[{tool:'retry_sync',ok:false}],message:'WMS je nedostupné. Automatické opakování se neprovádí.'});
  }
  if(rec.payment.status!=='paid'||rec.fulfillment.status!=='not_received'){
   p.state='blocked';return out(409,{status:'blocked',error:'retry_not_applicable'});
  }
  rec.fulfillment={...rec.fulfillment,status:'ready_to_ship',blocked_reason:null,shipped:false};
  rec.sync_logs.entries.unshift({status:'success',error:null,message:'Objednávka přijata ve WMS',at:new Date().toISOString()});
  rec.version++;
  result={status:'synchronized',idempotency_key:p.order_id,shipped:false};
 }else{
  const t={ticket_id:'INC-'+p.id,order_id:p.order_id,description:p.arguments.description,status:'open'};
  st.tickets.push(t);result=t;
 }
 audit('action_executed',{tool:p.action,proposal_id:p.id,result});
 const verification=p.action==='retry_sync'
  ?{tool:'get_fulfillment',verified:rec.fulfillment.status==='ready_to_ship',result:JSON.parse(JSON.stringify(rec.fulfillment))}
  :{tool:'get_tickets',verified:st.tickets.some(t=>t.ticket_id===result.ticket_id),result:st.tickets.filter(t=>t.ticket_id===result.ticket_id)};
 audit('verification',{proposal_id:p.id,...verification});
 p.state='completed';
 return out(200,{status:verification.verified?'completed':'unverified',proposal_id:p.id,order_id:p.order_id,action:p.action,action_result:result,verification,actions_performed:[{tool:p.action,ok:true}],message:p.action==='retry_sync'?'Synchronizace ověřena. Objednávka je připravena k expedici, nikoli již odeslána.':'Incident byl vytvořen a ověřen.'});
}
if(tool==='get_audit')return out(200,{events:st.audit.filter(e=>!b.run_id||e.run_id===b.run_id),tickets:st.tickets});
if(!publicTools.includes(tool))return out(400,{error:'unknown_tool'});
const run=String(b.run_id||'');
if(!run||run.length>100)return out(422,{error:'invalid_run_id'});
const r=st.runs[run]||(st.runs[run]={at:now,calls:0,seen:{},verified:{},order_id:id});
if((b.expected_order_id&&String(b.expected_order_id)!==id)||(r.order_id&&r.order_id!==id))return out(403,{error:'order_scope_mismatch'});
r.order_id=id;r.verified=r.verified||{};
r.calls++;
if(r.calls>10)return out(429,{error:'tool_budget_exceeded'});
const key=tool+'|'+id;
if(r.seen[key])return out(409,{error:'duplicate_tool_call',tool});
r.seen[key]=true;
if(!/^\d{1,12}$/.test(id))return out(422,{error:'invalid_order_id'});
const rec=st.orders[id];
if(!rec)return out(404,{error:'order_not_found',order_id:id});
if(tool==='get_sync_logs'&&id==='100247')return out(503,{error:'wms_unavailable',message:'Simulovaný výpadek WMS'});
if(actions.includes(tool)){
 if(!r.verified.get_order)return out(409,{error:'order_not_verified',message:'Nejprve ověř objednávku přes get_order. Návrh nebyl uložen.'});
 if(tool==='retry_sync'&&(!r.verified.get_payment||!r.verified.get_fulfillment||!r.verified.get_sync_logs))return out(409,{error:'sync_cause_not_verified',message:'Před návrhem retry ověř platbu, sklad a logy.'});
 if(tool==='retry_sync'&&(rec.payment.status!=='paid'||rec.fulfillment.status!=='not_received'))return out(409,{error:'retry_not_applicable'});
 if(tool==='retry_sync'&&(!confirmedSyncFailure(r.observations?.get_sync_logs)||!confirmedSyncFailure(rec.sync_logs)))return out(409,{error:'sync_failure_not_confirmed',message:'Poslední přečtený i aktuální záznam synchronizace musí potvrzovat chybu.'});
 const description=String(b.description||'').trim();
 if(tool==='create_ticket'&&(!description||description.length>2000))return out(422,{error:'invalid_description'});
 const proposal={id:'VK-'+run+'-'+tool,order_id:id,action:tool,arguments:tool==='retry_sync'?{order_id:id}:{order_id:id,description},version:rec.version,sync_failure_confirmed:tool==='retry_sync',created_at:now,expires_at:now+1800000,state:'pending'};
 st.proposals[proposal.id]=proposal;
 audit('approval_requested',{run_id:run,proposal_id:proposal.id,action:tool,arguments:proposal.arguments});
 return out(200,{status:'approval_required',executed:false,proposal:{id:proposal.id,action:tool,arguments:proposal.arguments,expires_at:proposal.expires_at},message:'Akce je pouze připravena. Provedení vyžaduje schválení člověkem.'});
}
return out(200,JSON.parse(JSON.stringify({get_order:rec.order,get_payment:rec.payment,get_fulfillment:rec.fulfillment,get_sync_logs:rec.sync_logs}[tool])));
