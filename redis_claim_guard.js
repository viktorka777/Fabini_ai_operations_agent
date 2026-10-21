const p=$('Validate proposal').first().json;
const raw=$input.first().json;
const key=typeof p.proposal_id==='string'?'fabini:vk:claim:'+p.proposal_id:null;
const reliable=key&&raw&&typeof raw==='object'&&!Array.isArray(raw)
 &&Object.keys(raw).length===1&&!Object.prototype.hasOwnProperty.call(raw,'error')
 &&Object.prototype.hasOwnProperty.call(raw,key)&&typeof raw[key]==='number'
 &&Number.isSafeInteger(raw[key])&&raw[key]>=1;
const n=reliable?raw[key]:null;
return [{json:{...p,lock_ok:n===1,http_status:n===1?200:n>1?409:503,
 status:n===1?'locked':'blocked',error:n===1?null:n>1?'approval_already_used':'lock_store_unavailable'}}];
