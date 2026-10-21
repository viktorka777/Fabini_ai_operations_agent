const fs=require('fs');
const path=require('path');
const assert=require('assert/strict');
const crypto=require('crypto');
const option=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const root=path.resolve(option('--project')||__dirname);
const workflows=Object.fromEntries(['01_mock','02_agent','03_approval'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,'exports',name+'.json')))]));
const code=(workflow,name)=>workflows[workflow].nodes.find(node=>node.name===name).parameters.jsCode;
const clone=value=>structuredClone(value);
const resultFor=(order_id='100245',action='retry_sync')=>({order_id,root_cause_code:'sync_failure',summary:'Stav byl ověřen dostupnými nástroji.',recommended_action:action,next_steps:[]});

function mockRuntime(){
 const state={};
 const call=body=>{
  const result=new Function('$input','$getWorkflowStaticData',code('01_mock','Mock state and guarded tools'))(
   {first:()=>({json:{body}})},()=>state
  )[0].json;
  return {statusCode:result.status,body:clone(result.payload)};
 };
 return {state,call};
}

function investigation({order_id='100245',run_id='101',action='retry_sync',tools=['get_order','get_payment','get_fulfillment','get_sync_logs']}={}){
 const runtime=mockRuntime();
 const steps=[];
 const request={request:'Zjisti příčinu blokace objednávky '+order_id+'.',expected_order_id:order_id,run_id};
 const invoke=(tool,args={})=>{
  const input={order_id,...args};
  const response=runtime.call({tool,...input,run_id,expected_order_id:order_id});
  steps.push({action:{tool,toolInput:input,log:'Calling '+tool},observation:response.statusCode<300
   ?JSON.stringify(response.body):'There was an error: "Request failed with status code '+response.statusCode+'"'});
  return response;
 };
 for(const tool of tools)invoke(tool);
 let proposal=null;
 if(action)proposal=invoke(action,action==='create_ticket'?{description:'Prověřit blokovanou objednávku.'}:{}).body.proposal;
 return {...runtime,request,steps,invoke,proposal};
}

function report(ctx,output=resultFor(ctx.request.expected_order_id,ctx.proposal?.action||'none'),steps=ctx.steps){
 return new Function('$input','$',code('02_agent','Grounded report'))(
  {first:()=>({json:{output:typeof output==='string'?output:JSON.stringify(output),intermediateSteps:steps}})},
  name=>{assert.equal(name,'Validate request');return {first:()=>({json:ctx.request})};}
 )[0].json;
}
function expectFailed(value,reason){
 assert.equal(value.status,'failed');
 assert.equal(value.http_status,502);
 assert.equal(value.approval_required,false);
 assert.equal(value.pending_action,null);
 assert.equal(value.approval_endpoint,null);
 assert.equal(value.approval_example,null);
 assert.deepEqual(value.actions_performed,[]);
 if(reason)assert.ok(value.schema_errors.some(error=>error.includes(reason)),JSON.stringify(value.schema_errors));
}
function runGuard(name,raw,context){
 return new Function('$input','$',code('03_approval',name))(
  {first:()=>({json:raw})},()=>({first:()=>({json:context})})
 )[0].json;
}

function approval(runtime,body,options={}){
 const wf=workflows['03_approval'],refs={},trace=[];
 const by=new Map(wf.nodes.map(node=>[node.name,node]));
 const select=name=>{assert.ok(Object.hasOwn(refs,name),'Missing reference '+name);return {first:()=>({json:refs[name]})};};
 const evaluate=(value,input)=>{
  if(typeof value!=='string'||!value.startsWith('='))return value;
  const expression=value.match(/^=\s*\{\{([\s\S]*)\}\}\s*$/);
  if(expression)return new Function('$json','$','return ('+expression[1]+')')(input,select);
  return value.slice(1).replace(/\{\{([\s\S]*?)\}\}/g,(_,source)=>new Function('$json','$','return ('+source+')')(input,select));
 };
 runtime.redis=runtime.redis||new Map();
 let input={body},name='Approval endpoint';
 for(let i=0;i<45;i++){
  const node=by.get(name);assert.ok(node,'Unknown node '+name);trace.push(name);let branch=0;
  if(node.type.endsWith('.code'))input=new Function('$input','$json','$',node.parameters.jsCode)({first:()=>({json:input})},input,select)[0].json;
  else if(node.type.endsWith('.if'))branch=evaluate(node.parameters.conditions.conditions[0].leftValue,input)===true?0:1;
  else if(node.type.endsWith('.httpRequest'))input=runtime.call(JSON.parse(evaluate(node.parameters.jsonBody,input)));
  else if(node.type.endsWith('.redis')){
   const key=evaluate(node.parameters.key,input);
   if(options.redis&&options.redis.node===name)input=options.redis.response(key,input);
   else{const value=(runtime.redis.get(key)||0)+1;runtime.redis.set(key,value);input={[key]:value};}
  }else if(node.type.endsWith('.respondToWebhook'))return {http:evaluate(node.parameters.options.responseCode,input),result:evaluate(node.parameters.responseBody,input),trace};
  else assert.ok(node.type.endsWith('.webhook'));
  refs[name]=clone(input);
  const next=wf.connections[name]?.main?.[branch];assert.equal(next?.length,1);name=next[0].node;
 }
 throw Error('Approval graph exceeded offline execution limit');
}

const cases=[];
function test(name,fn){
 try{fn();cases.push({name,passed:true});console.log('PASS '+name);}
 catch(error){cases.push({name,passed:false,error:error.message});console.error('FAIL '+name+': '+error.message);}
}

for(const action of ['retry_sync','create_ticket'])test('report confirms the actual '+action+' proposal',()=>{
 const ctx=investigation({action});const r=report(ctx);
 assert.equal(r.status,'approval_required');assert.equal(r.pending_action.action,action);
 assert.equal(r.pending_action.id,ctx.proposal.id);assert.equal(r.approval_required,true);
 assert.equal(r.recommended_action,action);assert.deepEqual(r.actions_performed,[]);
 assert.equal(ctx.state.tickets.length,0);assert.equal(ctx.state.orders['100245'].fulfillment.status,'not_received');
});
test('payment diagnosis without a proposal completes without a mutation',()=>{
 const ctx=investigation({order_id:'100246',action:null,tools:['get_order','get_payment']});
 const r=report(ctx,{...resultFor('100246','none'),root_cause_code:'payment_not_completed'});
 assert.equal(r.status,'completed');assert.equal(r.approval_required,false);assert.equal(r.pending_action,null);
});
test('invalid LLM JSON fails with diagnostics',()=>expectFailed(report(investigation(),'{broken'),'not valid JSON'));
for(const recommended of ['none','create_ticket'])test('pending retry cannot be reported as '+recommended,()=>{
 expectFailed(report(investigation(),resultFor('100245',recommended)),'does not match');
});
for(const action of ['retry_sync','create_ticket'])test(action+' recommendation requires a stored proposal',()=>{
 const ctx=investigation({action:null});expectFailed(report(ctx,resultFor('100245',action)),'no confirmed stored proposal');
});
test('failed proposal tool cannot report completed or approval required',()=>{
 const ctx=investigation({action:null});
 ctx.steps.push({action:{tool:'retry_sync',toolInput:{order_id:'100245'}},observation:'There was an error: "Request failed with status code 500"'});
 const r=report(ctx,resultFor());expectFailed(r,'no confirmed stored proposal');assert.equal(r.tool_errors.length,1);
});
for(const [name,mutate] of [
 ['foreign proposal action',p=>({...p,action:'create_ticket'})],
 ['foreign proposal ID',p=>({...p,id:'VK-999-retry_sync'})],
 ['foreign proposal order',p=>({...p,arguments:{order_id:'100246'}})],
 ['expired proposal',p=>({...p,expires_at:0})]
])test('report rejects '+name,()=>{
 const ctx=investigation(),steps=clone(ctx.steps),last=steps.at(-1);
 const body=JSON.parse(last.observation);body.proposal=mutate(body.proposal);last.observation=JSON.stringify(body);
 expectFailed(report(ctx,resultFor(),steps),'Invalid stored action proposal');
});
test('report rejects multiple stored proposals',()=>{
 const ctx=investigation();ctx.invoke('create_ticket',{description:'Second action.'});
 expectFailed(report(ctx,resultFor('100245','create_ticket')),'Multiple stored action proposals');
});
for(const output of [null,[]])test('report rejects '+(output===null?'null':'array')+' JSON output',()=>{
 expectFailed(report(investigation(),output),'must be a JSON object');
});
test('report rejects an empty summary',()=>{
 expectFailed(report(investigation(),{...resultFor(),summary:'   '}),'Invalid field: summary');
});
for(const [name,mutate] of [
 ['missing expiry',body=>delete body.proposal.expires_at],
 ['non-numeric expiry',body=>body.proposal.expires_at=String(Date.now()+60000)],
 ['already executed action',body=>body.executed=true],
 ['missing execution state',body=>delete body.executed]
])test('report rejects '+name,()=>{
 const ctx=investigation(),steps=clone(ctx.steps),last=steps.at(-1);
 const body=JSON.parse(last.observation);mutate(body);last.observation=JSON.stringify(body);
 expectFailed(report(ctx,resultFor(),steps),'Invalid stored action proposal');
});
for(const description of ['', 'x'.repeat(2001)])test('report rejects '+(description?'oversized':'empty')+' ticket arguments',()=>{
 const ctx=investigation({action:'create_ticket'}),steps=clone(ctx.steps),last=steps.at(-1);
 const body=JSON.parse(last.observation);body.proposal.arguments.description=description;last.observation=JSON.stringify(body);
 expectFailed(report(ctx,resultFor('100245','create_ticket'),steps),'Invalid stored action proposal');
});
test('approval-required response without a proposal cannot report completion',()=>{
 const ctx=investigation(),steps=clone(ctx.steps),last=steps.at(-1);
 const body=JSON.parse(last.observation);delete body.proposal;last.observation=JSON.stringify(body);
 expectFailed(report(ctx,resultFor('100245','none'),steps),'Invalid stored action proposal');
});
test('unknown order remains a controlled failure',()=>{
 const ctx=investigation({order_id:'999999',action:null,tools:['get_order']});
 const r=report(ctx,{...resultFor('999999','none'),root_cause_code:'unknown'});
 expectFailed(r);assert.equal(r.tool_errors.length,1);
});
test('WMS outage can still prepare a truthful incident proposal',()=>{
 const ctx=investigation({order_id:'100247',action:'create_ticket',tools:['get_order','get_fulfillment','get_sync_logs']});
 const r=report(ctx,{...resultFor('100247','create_ticket'),root_cause_code:'tool_error'});
 assert.equal(r.status,'approval_required');assert.equal(r.tool_errors.length,1);assert.equal(r.pending_action.action,'create_ticket');
});

function seedRetryWithLogs(entries){
 const ctx=investigation({action:null,tools:['get_order']});
 ctx.state.orders['100245'].sync_logs.entries=entries;
 for(const tool of ['get_payment','get_fulfillment','get_sync_logs'])ctx.invoke(tool);
 return ctx;
}
for(const [name,entries] of [
 ['successful logs',[{status:'success',error:null}]],
 ['success after an older failure',[{status:'success'},{status:'failed'}]],
 ['empty logs',[]],
 ['missing log entries',null],
 ['unknown log status',[{status:'unknown',error:'WMS_TIMEOUT'}]],
 ['failure without an error code',[{status:'failed'}]],
 ['failure with an empty error code',[{status:'failed',error:'   '}]]
])test('retry proposal is blocked for '+name,()=>{
 const ctx=seedRetryWithLogs(entries),r=ctx.invoke('retry_sync');
 assert.equal(r.statusCode,409);assert.equal(r.body.error,'sync_failure_not_confirmed');
 assert.equal(Object.keys(ctx.state.proposals).length,0);assert.equal(ctx.state.orders['100245'].fulfillment.status,'not_received');
});
test('a latest failure permits retry despite an older success',()=>{
 const ctx=seedRetryWithLogs([{status:'failed',error:'WMS_TIMEOUT'},{status:'success',error:null}]);assert.equal(ctx.invoke('retry_sync').body.status,'approval_required');
});
for(const [name,observed,current] of [
 ['success followed by a new failure',[{status:'success',error:null}],[{status:'failed',error:'WMS_TIMEOUT'}]],
 ['failure followed by success',[{status:'failed',error:'WMS_TIMEOUT'}],[{status:'success',error:null}]]
])test('retry proposal is blocked after '+name,()=>{
 const ctx=seedRetryWithLogs(observed);ctx.state.orders['100245'].sync_logs.entries=current;
 const r=ctx.invoke('retry_sync');
 assert.equal(r.statusCode,409);assert.equal(r.body.error,'sync_failure_not_confirmed');
 assert.equal(Object.keys(ctx.state.proposals).length,0);assert.equal(ctx.state.orders['100245'].fulfillment.status,'not_received');
});
test('sync failure is checked again immediately before the effect',()=>{
 const ctx=investigation();ctx.state.orders['100245'].sync_logs.entries=[{status:'success'}];
 const r=ctx.call({tool:'execute_approved',proposal_id:ctx.proposal.id,decision:'approve',lock_granted:true});
 assert.equal(r.statusCode,409);assert.equal(r.body.error,'sync_failure_not_confirmed');
 assert.equal(ctx.state.orders['100245'].fulfillment.status,'not_received');
 assert.equal(ctx.state.audit.filter(event=>event.event==='action_executed').length,0);
});

const context={valid:true,proposal_id:'VK-101-create_ticket',proposal:{order_id:'100248',action:'create_ticket'}};
for(const [name,field,key] of [
 ['Check approval lock','lock_ok','fabini:vk:claim:VK-101-create_ticket'],
 ['Check cooldown','window_ok','fabini:vk:cooldown:100248:create_ticket']
]){
 for(const [label,raw] of [
  ['error-only response',{error:'Redis unavailable'}],
  ['input fields with an error',{valid:true,error:'Redis unavailable'}],
  ['count with an error',{[key]:1,error:'Redis unavailable'}],
  ['count with a null error field',{[key]:1,error:null}],
  ['wrong Redis key',{wrong:1}],
  ['string count',{[key]:'1'}],
  ['boolean count',{[key]:true}],
  ['zero count',{[key]:0}],
  ['negative count',{[key]:-1}],
  ['fractional count',{[key]:1.5}],
  ['ambiguous counts',{[key]:1,other:1}]
 ])test(name+' rejects '+label,()=>{
  const r=runGuard(name,raw,context);assert.equal(r[field],false);assert.equal(r.http_status,503);assert.equal(r.error,'lock_store_unavailable');
 });
 test(name+' accepts only a first numeric count under its exact key',()=>{
  const r=runGuard(name,{[key]:1},context);assert.equal(r[field],true);assert.equal(r.http_status,200);
 });
 test(name+' blocks an already incremented count',()=>{
  const r=runGuard(name,{[key]:2},context);assert.equal(r[field],false);assert.equal(r.http_status,field==='lock_ok'?409:429);
 });
}

test('approval graph executes and verifies a valid retry exactly once',()=>{
 const ctx=investigation();const body={proposal_id:ctx.proposal.id,decision:'approve'};
 const first=approval(ctx,body),second=approval(ctx,body);
 assert.equal(first.http,200);assert.equal(first.result.verification.verified,true);
 assert.equal(first.result.verification.result.shipped,false);assert.equal(second.http,409);
 assert.equal(ctx.state.audit.filter(event=>event.event==='action_executed').length,1);
});
test('approval graph persists denial and refuses a later approve',()=>{
 const ctx=investigation({action:'create_ticket'});
 assert.equal(approval(ctx,{proposal_id:ctx.proposal.id,decision:'deny'}).result.status,'denied');
 assert.equal(approval(ctx,{proposal_id:ctx.proposal.id,decision:'approve'}).http,409);
 assert.equal(ctx.state.tickets.length,0);
});
test('approval graph cooldown prevents a second ticket from another proposal',()=>{
 const ctx=investigation({order_id:'100248',action:'create_ticket',tools:['get_order']});
 ctx.call({tool:'get_order',order_id:'100248',run_id:'102'});
 const other=ctx.call({tool:'create_ticket',order_id:'100248',run_id:'102',description:'Second request.'}).body.proposal;
 const first=approval(ctx,{proposal_id:ctx.proposal.id,decision:'approve'});
 assert.equal(first.http,200);assert.equal(first.result.verification.verified,true);
 assert.equal(first.result.verification.result[0].ticket_id,first.result.action_result.ticket_id);
 assert.equal(approval(ctx,{proposal_id:other.id,decision:'approve'}).http,429);
 assert.equal(ctx.state.tickets.length,1);
});
for(const [name,mutate,http,error] of [
 ['expired proposal',ctx=>ctx.state.proposals[ctx.proposal.id].expires_at=0,410,'approval_expired'],
 ['changed order version',ctx=>ctx.state.orders['100245'].version++,409,'state_changed_since_analysis'],
 ['sync logs changed after diagnosis',ctx=>ctx.state.orders['100245'].sync_logs.entries=[{status:'success',error:null}],409,'sync_failure_not_confirmed']
])test('approval graph blocks '+name+' before claiming or executing',()=>{
 const ctx=investigation();mutate(ctx);
 const r=approval(ctx,{proposal_id:ctx.proposal.id,decision:'approve'});
 assert.equal(r.http,http);assert.equal(r.result.error,error);
 assert.equal(ctx.state.orders['100245'].fulfillment.status,'not_received');
 assert.ok(!r.trace.includes('Claim approval'));assert.ok(!r.trace.includes('Execute and verify approved action'));
 assert.equal(ctx.state.audit.filter(event=>event.event==='action_executed').length,0);
});
for(const [name,body,http] of [
 ['invalid decision',{proposal_id:'VK-101-retry_sync',decision:'maybe'},422],
 ['unknown proposal',{proposal_id:'VK-999-retry_sync',decision:'approve'},404]
])test('approval graph rejects '+name,()=>{
 const ctx=investigation(),r=approval(ctx,body);
 assert.equal(r.http,http);assert.ok(!r.trace.includes('Claim approval'));
 assert.ok(!r.trace.includes('Execute and verify approved action'));
 assert.equal(ctx.state.audit.filter(event=>event.event==='action_executed').length,0);
});
for(const node of ['Claim approval','Action cooldown'])test('approval graph fails closed when '+node+' returns input plus an error',()=>{
 const ctx=investigation({action:'create_ticket'});
 const r=approval(ctx,{proposal_id:ctx.proposal.id,decision:'approve'},{redis:{node,response:(key,input)=>({...input,error:'Redis unavailable'})}});
 assert.equal(r.http,503);assert.equal(r.result.status,'blocked');assert.equal(r.result.error,'lock_store_unavailable');
 assert.equal(ctx.state.tickets.length,0);assert.ok(!r.trace.includes('Execute and verify approved action'));
});

const passed=cases.filter(item=>item.passed).length;
const reportData={
 mode:'offline_exported_code_and_graph_with_simulated_redis',
 limitations:['No live n8n, Redis connection, or LLM calls are executed by this test.'],
 exports:Object.fromEntries(Object.keys(workflows).map(name=>[name+'.json',crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'exports',name+'.json'))).digest('hex')])),
 passed,total:cases.length,cases
};
if(option('--report'))fs.writeFileSync(path.resolve(option('--report')),JSON.stringify(reportData,null,2)+'\n');
console.log(`${passed}/${cases.length} regression checks passed`);
if(passed!==cases.length)process.exitCode=1;
