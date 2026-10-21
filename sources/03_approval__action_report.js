const r=$input.first().json;return [{json:{...(r.body||{status:'failed',error:r.error||'mock_unavailable'}),http_status:r.statusCode||503}}];
