const b=$input.first().json.body||{};const ok=typeof b.proposal_id==='string'&&/^VK-[0-9]+-(retry_sync|create_ticket)$/.test(b.proposal_id)&&['approve','deny'].includes(b.decision);
return [{json:{valid:ok,proposal_id:ok?b.proposal_id:null,decision:b.decision,http_status:ok?200:422,status:ok?'ready':'invalid_request',message:ok?'':'proposal_id a rozhodnutí approve/deny jsou povinné'}}];
