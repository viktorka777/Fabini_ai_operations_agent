import argparse,json,os,urllib.request,urllib.error,sys

def main():
 p=argparse.ArgumentParser(description='FABINI n8n case-study client')
 p.add_argument('--base',default=os.getenv('N8N_BASE_URL','http://localhost:5678'))
 sub=p.add_subparsers(dest='command',required=True)
 r=sub.add_parser('request');r.add_argument('text')
 a=sub.add_parser('approve');a.add_argument('proposal_id')
 d=sub.add_parser('deny');d.add_argument('proposal_id')
 sub.add_parser('reset',help='Admin-only: resets isolated demo data/cooldowns; never production systems')
 args=p.parse_args()
 role='FABINI_INTERNAL_KEY' if args.command=='reset' else 'FABINI_OPERATOR_KEY'
 key=os.getenv(role)
 if not key:p.error('Set '+role+' in the environment. Never put it in chat or source control.')
 if args.command=='request':path='fabini-vk-request';body={'request':args.text}
 elif args.command=='reset':path='fabini-vk-reset';body={}
 else:path='fabini-vk-approval';body={'proposal_id':args.proposal_id,'decision':args.command}
 req=urllib.request.Request(args.base.rstrip('/')+'/webhook/'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json','X-Fabini-Key':key})
 try:
  with urllib.request.urlopen(req,timeout=150) as res:status=res.status;raw=res.read().decode()
 except urllib.error.HTTPError as e:status=e.code;raw=e.read().decode()
 except (urllib.error.URLError,TimeoutError) as e:print('Connection failed:',e,file=sys.stderr);return 1
 try:result=json.loads(raw)
 except ValueError:result={'message':raw[:500]}
 print(json.dumps({'http_status':status,'result':result},ensure_ascii=False,indent=2))
 return 0 if status<400 else 1
if __name__=='__main__':sys.exit(main())
