from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
for source,export,node_name in [('mock_api.js','01_mock.json','Mock state and guarded tools'),('finalize.js','02_agent.json','Grounded report'),('redis_claim_guard.js','03_approval.json','Check approval lock'),('redis_cooldown_guard.js','03_approval.json','Check cooldown')]:
 path=root/'exports'/export
 workflow=json.loads(path.read_text())
 matches=[n for n in workflow['nodes'] if n['name']==node_name]
 if len(matches)!=1:raise ValueError('Expected exactly one node: '+node_name)
 matches[0]['parameters']['jsCode']=(root/source).read_text()
 path.write_text(json.dumps(workflow,ensure_ascii=False,indent=2)+'\n')
 print('Updated',export,node_name)
