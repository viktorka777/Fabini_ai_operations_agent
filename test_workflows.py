import json,pathlib,unittest
ROOT=pathlib.Path(__file__).parent
class WorkflowTests(unittest.TestCase):
 def test_structure_and_credentials(self):
  files=list((ROOT/'exports').glob('*.json'))
  self.assertEqual(len(files),4)
  paths=[]
  for f in files:
   w=json.loads(f.read_text());names={n['name'] for n in w['nodes']}
   self.assertTrue(w['name'].startswith('FABINI · Viktoriia'))
   for n in w['nodes']:
    for ref in n.get('credentials',{}).values():self.assertEqual(set(ref),{'name'})
    if n['type']=='n8n-nodes-base.webhook':
     paths.append(n['parameters']['path']);self.assertEqual(n['parameters']['authentication'],'headerAuth')
    if n['type']=='@n8n/n8n-nodes-langchain.agent':self.assertEqual(n['parameters']['options']['maxIterations'],8)
   for src,ports in w['connections'].items():
    self.assertIn(src,names)
    for groups in ports.values():
     for group in groups:
      for edge in group:self.assertIn(edge['node'],names)
  self.assertEqual(len(paths),len(set(paths)))
  self.assertTrue(all(p.startswith('fabini-vk-') for p in paths))
 def test_sources_match_exports(self):
  for source,filename,name in [('mock_api.js','01_mock.json','Mock state and guarded tools'),('finalize.js','02_agent.json','Grounded report'),('redis_claim_guard.js','03_approval.json','Check approval lock'),('redis_cooldown_guard.js','03_approval.json','Check cooldown')]:
   w=json.loads((ROOT/'exports'/filename).read_text())
   n=next(n for n in w['nodes'] if n['name']==name)
   self.assertEqual((ROOT/source).read_text().strip(),n['parameters']['jsCode'].strip())
 def test_six_real_tool_connections(self):
  w=json.loads((ROOT/'exports/02_agent.json').read_text())
  tools={n['name'] for n in w['nodes'] if n['type']=='@n8n/n8n-nodes-langchain.toolHttpRequest'}
  self.assertEqual(tools,{'get_order','get_payment','get_fulfillment','get_sync_logs','retry_sync','create_ticket'})
  for name in tools:self.assertEqual(w['connections'][name]['ai_tool'][0][0]['node'],'Operations AI Agent')
if __name__=='__main__':unittest.main()
