const b=$input.first().json.body||{};const text=b.request;
const ids=typeof text==='string'?[...new Set(text.match(/\b\d{6,12}\b/g)||[])]:[];
const ok=typeof text==='string'&&text.trim().length>0&&text.length<=2000&&ids.length===1;
return [{json:{valid:ok,expected_order_id:ids.length===1?ids[0]:null,request:ok?text.trim():'',run_id:String($execution.id),status:ok?'ready':'invalid_request',http_status:ok?200:422,message:ok?'':'request musí být neprázdný text do 2000 znaků s jedním číslem objednávky (6–12 číslic)'}}];
