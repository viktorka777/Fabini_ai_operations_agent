from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
folder=root/'sources';folder.mkdir(exist_ok=True)
rows=[]
for path in sorted((root/'exports').glob('*.json')):
 w=json.loads(path.read_text())
 for n in w['nodes']:
  if n['type']=='n8n-nodes-base.code':
   filename=path.stem+'__'+re.sub(r'[^a-z0-9]+','_',n['name'].lower()).strip('_')+'.js'
   (folder/filename).write_text(n['parameters']['jsCode']+'\n')
   rows.append((path.name,n['name'],filename))
  if n['type']=='@n8n/n8n-nodes-langchain.agent':
   (folder/'SYSTEM_PROMPT.txt').write_text(n['parameters']['options']['systemMessage']+'\n')
(root/'docs/SOURCE_MAP.md').write_text('# Mapa zdrojových kódů\n\nJSON exporty jsou spustitelná definice workflow. `sources/` obsahuje čitelnou kopii každého Code node a system promptu. Po změně exportu je obnovte příkazem `python3 scripts/extract_sources.py`. Úprava těchto kopií sama workflow nezmění. Pro čtyři hlavní JS moduly lze použít `scripts/sync_sources.py`.\n\n| Export | Node | Kopie zdroje |\n|---|---|---|\n'+''.join(f'| {w} | {n} | `sources/{f}` |\n' for w,n,f in rows))
print('Extracted',len(rows),'Code node sources and system prompt.')
