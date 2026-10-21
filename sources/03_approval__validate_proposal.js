const r=$input.first().json;const b=r.body||{};const req=$('Validate approval').first().json;
return [{json:{...req,...b,valid:r.statusCode===200&&b.status==='valid',http_status:r.statusCode||503,status:r.statusCode===200?'valid':'blocked',error:b.error||r.error||null}}];
