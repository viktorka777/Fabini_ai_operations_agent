const r=$json;return [{json:{...(r.body||{status:'failed'}),http_status:r.statusCode||503}}];
