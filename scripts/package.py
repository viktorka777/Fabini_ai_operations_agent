from pathlib import Path
import argparse
import hashlib
import json
import re
import zipfile

ROOT=Path(__file__).resolve().parents[1]

def main():
 parser=argparse.ArgumentParser(description='Package the FABINI case study and refresh SHA256SUMS')
 parser.add_argument('--output',type=Path,default=ROOT.parent/'FABINI_AI_Operations_Agent.zip')
 args=parser.parse_args()
 blobs={}
 for file in sorted(ROOT.rglob('*')):
  relative=file.relative_to(ROOT)
  if not file.is_file() or file.name=='SHA256SUMS' or '__pycache__' in relative.parts:continue
  if any(part.startswith('.') for part in relative.parts) and str(relative) not in ['.env.example','.gitignore']:continue
  if file.suffix in ['.pyc','.log','.zip']:continue
  data=file.read_bytes()
  assert not re.search(rb'sk-or-v1-[A-Za-z0-9]{16,}|gsk_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA|OPENSSH) PRIVATE KEY',data),relative
  if relative.parts[0]=='exports' and file.suffix=='.json':
   workflow=json.loads(data)
   for node in workflow['nodes']:
    for ref in node.get('credentials',{}).values():assert set(ref)=={'name'},relative
  blobs[relative.as_posix()]=data
 sums=''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in blobs.items())
 (ROOT/'SHA256SUMS').write_text(sums)
 blobs['SHA256SUMS']=sums.encode()
 output=args.output.resolve()
 output.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as archive:
  for name,data in blobs.items():archive.writestr(ROOT.name+'/'+name,data)
 with zipfile.ZipFile(output) as archive:
  assert archive.testzip() is None
  assert all(archive.read(ROOT.name+'/'+name)==data for name,data in blobs.items())
 print(json.dumps({'file':str(output),'entries':len(blobs),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))

if __name__=='__main__':main()
