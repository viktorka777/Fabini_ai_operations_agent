const p=$('Check approval lock').first().json;
const raw=$input.first().json;
const proposal=p.proposal;
const key=proposal&&typeof proposal.order_id==='string'&&['retry_sync','create_ticket'].includes(proposal.action)
 ?'fabini:vk:cooldown:'+proposal.order_id+':'+proposal.action:null;
const reliable=key&&raw&&typeof raw==='object'&&!Array.isArray(raw)
 &&Object.keys(raw).length===1&&!Object.prototype.hasOwnProperty.call(raw,'error')
 &&Object.prototype.hasOwnProperty.call(raw,key)&&typeof raw[key]==='number'
 &&Number.isSafeInteger(raw[key])&&raw[key]>=1;
const n=reliable?raw[key]:null;
return [{json:{...p,window_ok:n===1,http_status:n===1?200:n>1?429:503,
 status:n===1?'locked':'blocked',error:n===1?null:n>1?'action_limit_reached':'lock_store_unavailable'}}];

