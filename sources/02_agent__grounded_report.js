const a=$input.first().json;
const request=$('Validate request').first().json;
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
let result=null;const schema_errors=[];
try{result=JSON.parse(String(a.output||'').replace(/^```(?:json)?\s*|\s*```$/g,'').trim());}catch(e){schema_errors.push('LLM output is not valid JSON');}
const steps=[],proposals=[];
for(const s of a.intermediateSteps||[]){
 const action=s.action||{};
 const tool=['get_order','get_payment','get_fulfillment','get_sync_logs','retry_sync','create_ticket'].find(t=>String(action.tool||'').includes(t))||String(action.tool||'unknown');
 let observation=s.observation;let parsed;
 try{parsed=typeof observation==='string'?JSON.parse(observation):observation;}catch(e){parsed=String(observation||'').slice(0,800);}
 const ok=typeof parsed==='object'&&parsed!==null?!parsed.error:!(/error|exception|status code/i.test(parsed));
 steps.push({tool,arguments:action.toolInput||{},ok,result:parsed,decision:action.log||''});
 if(ok&&isObject(parsed)&&parsed.status==='approval_required'){
  const p=parsed.proposal;
  const validProposal=isObject(p)&&['retry_sync','create_ticket'].includes(tool)
   &&p.action===tool&&p.id==='VK-'+request.run_id+'-'+tool&&parsed.executed===false
   &&isObject(p.arguments)&&p.arguments.order_id===request.expected_order_id
   &&typeof p.expires_at==='number'&&Number.isFinite(p.expires_at)&&p.expires_at>Date.now()
   &&(tool!=='create_ticket'||(typeof p.arguments.description==='string'&&p.arguments.description.trim().length>0&&p.arguments.description.length<=2000));
  if(validProposal)proposals.push(p);
  else schema_errors.push('Invalid stored action proposal');
 }
}
if(proposals.length>1)schema_errors.push('Multiple stored action proposals in one run');
const pending=proposals.length===1?proposals[0]:null;
if(isObject(result)){
 for(const k of ['order_id','root_cause_code','summary','recommended_action'])if(typeof result[k]!=='string'||!result[k].trim())schema_errors.push('Invalid field: '+k);
 if(!['sync_failure','payment_not_completed','stock_shortage','tool_error','unknown','no_issue'].includes(result.root_cause_code))schema_errors.push('Invalid root cause code');
 if(!['retry_sync','create_ticket','none'].includes(result.recommended_action))schema_errors.push('Invalid action');
 if(!Array.isArray(result.next_steps)||!result.next_steps.every(x=>typeof x==='string'))schema_errors.push('Invalid next_steps');
 const observed=steps.filter(s=>s.ok&&s.result&&typeof s.result==='object').map(s=>s.result.order_id).filter(Boolean);
 if(observed.some(id=>String(id)!==result.order_id))schema_errors.push('Order id mismatch');
 if(result.order_id!==request.expected_order_id||!/^\d{6,12}$/.test(result.order_id))schema_errors.push('Order id not grounded in request');
 if(pending&&result.recommended_action!==pending.action)schema_errors.push('Recommended action does not match stored proposal');
 if(result.recommended_action!=='none'&&!pending)schema_errors.push('Recommended action has no confirmed stored proposal');
}else if(!schema_errors.length)schema_errors.push('LLM output must be a JSON object');
const errors=steps.filter(s=>!s.ok).map(s=>({tool:s.tool,result:s.result}));
const hasOrder=steps.some(s=>s.tool==='get_order'&&s.ok&&s.result?.order_id);
if(!steps.length)schema_errors.push('No real tools were called');
const valid=isObject(result)&&schema_errors.length===0;
const eligible=valid&&hasOrder;
const status=!eligible?'failed':pending?'approval_required':errors.length?'partial':'completed';
return [{json:{status,run_id:request.run_id,request:request.request,order_id:valid?result.order_id:null,
 root_cause_code:valid?result.root_cause_code:'tool_error',summary:valid?result.summary:'Agent nevrátil ověřitelný výsledek.',
 recommended_action:valid?result.recommended_action:'none',next_steps:valid?result.next_steps:[],
 approval_required:!!(eligible&&pending),pending_action:eligible?pending:null,
 approval_endpoint:eligible&&pending?'/webhook/fabini-vk-approval':null,
 approval_example:eligible&&pending?{proposal_id:pending.id,decision:'approve'}:null,
 actions_performed:[],steps,tool_calls:steps.length,tool_errors:errors,schema_errors,
 note:'Diagnostika nic nezměnila. Návrh akce není její provedení.',http_status:status==='failed'?502:200}}];

