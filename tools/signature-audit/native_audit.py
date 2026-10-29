"""Read-only inspection of release downloads. Never launches an application."""
import json, pathlib, subprocess, hashlib, os, re, urllib.request
root=pathlib.Path('audit-work');root.mkdir(exist_ok=True)
manifest=json.loads(pathlib.Path('tools/signature-audit/manifest.json').read_text())
results=[]
def run(args):
 p=subprocess.run(args,text=True,capture_output=True,timeout=180)
 return {'exit_code':p.returncode,'output':(p.stdout+p.stderr)[-24000:]}
for a in manifest:
 if not a['name'].endswith('.dmg'):continue
 result={k:a[k] for k in ['tool','repo','tag','name','url','asset_id','github_digest']}
 try:
  path=root/str(a['asset_id'])/a['name'];path.parent.mkdir(exist_ok=True)
  # The token has read-only access and is used solely for the GitHub release asset endpoint.
  p=run(['gh','release','download',a['tag'],'--repo',a['repo'],'--pattern',a['name'],'--dir',str(path.parent),'--clobber'])
  if p['exit_code']:raise RuntimeError(p['output'])
  result['sha256']=hashlib.file_digest(open(path,'rb'),'sha256').hexdigest()
  result['digest_matches']=result['github_digest']==('sha256:'+result['sha256']) if result['github_digest'] else None
  result['dmg_signature']=run(['codesign','--verify','--verbose=2',str(path)])
  result['dmg_details']=run(['codesign','-d','--verbose=4',str(path)])
  result['stapler']=run(['xcrun','stapler','validate',str(path)])
  mount=path.parent/'mount';mount.mkdir(exist_ok=True)
  attach=run(['hdiutil','attach',str(path),'-readonly','-nobrowse','-noautoopen','-mountpoint',str(mount)])
  result['mount']=attach
  if attach['exit_code']==0:
   try:
    result['apps']=[]
    for app in mount.glob('*.app'):
     result['apps'].append({'name':app.name,'verify':run(['codesign','--verify','--deep','--strict','--verbose=2',str(app)]),'details':run(['codesign','-d','--verbose=4',str(app)]),'gatekeeper':run(['spctl','--assess','--type','execute','--verbose=4',str(app)]),'stapler':run(['xcrun','stapler','validate',str(app)])})
   finally: result['detach']=run(['hdiutil','detach',str(mount)])
  apps=result.get('apps',[])
  if apps and all(x['verify']['exit_code']==0 and 'Authority=Developer ID Application:' in x['details']['output'] for x in apps):
   result['status']='Apple Developer ID: geldig ondertekend'
  elif apps and all('Signature=adhoc' in x['details']['output'] for x in apps):result['status']='Alleen ad-hoc ondertekend; geen uitgevercertificaat'
  elif apps and any('not signed at all' in x['details']['output'] for x in apps):result['status']='Niet ondertekend'
  else:result['status']='macOS: verificatie mislukt of onbeslist'
 except Exception as e:result['status']='macOS: niet gecontroleerd';result['error']=str(e)
 results.append(result)
 pathlib.Path('macos-results.json').write_text(json.dumps(results,indent=2))
 print(result['tool'],result['tag'],result['name'],result['status'],flush=True)
 if 'path' in locals() and path.exists():path.unlink()
