"""Onderteken vastgepinde pakketbestanden met de bestaande organisatiesleutel."""
import os,pathlib,json,subprocess,hashlib,concurrent.futures
ROOT=pathlib.Path('linux-signatures');ROOT.mkdir(exist_ok=True)
manifest=json.loads(pathlib.Path('tools/signature-audit/unsigned-linux.json').read_text())
fingerprint='13F6D414ADEE4ED4CD09AC60601D86C93C504D29'
def gpg(args,**kw):
 p=subprocess.run(['gpg','--batch']+args,capture_output=True,**kw)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace') if isinstance(p.stderr,bytes) else p.stderr)
 return p
gpg(['--list-secret-keys',fingerprint])
pub=gpg(['--armor','--export',fingerprint]).stdout
(ROOT/'openaec-signing-public-key.asc').write_bytes(pub)
(ROOT/'openaec-signing-fingerprint.txt').write_text(fingerprint+'\n')
def sign(a):
 directory=ROOT/a['repo'].split('/')[1]/a['tag'];directory.mkdir(parents=True,exist_ok=True)
 path=directory/a['name']
 p=subprocess.run(['gh','release','download',a['tag'],'--repo',a['repo'],'--pattern',a['name'],'--dir',str(directory)],capture_output=True,text=True,timeout=600)
 if p.returncode:raise RuntimeError(p.stderr)
 sha=hashlib.file_digest(open(path,'rb'),'sha256').hexdigest()
 if sha!=a['sha256']:raise RuntimeError('Oorspronkelijke SHA256 wijkt af: '+a['name'])
 signature=pathlib.Path(str(path)+'.asc')
 gpg(['--yes','--pinentry-mode','loopback','--passphrase-fd','0','--local-user',fingerprint,'--armor','--detach-sign','--output',str(signature),str(path)],input=(os.environ.get('OPENAEC_GPG_PASSPHRASE','')+'\n').encode())
 verification=gpg(['--status-fd','1','--verify',str(signature),str(path)]).stdout.decode()
 if '[GNUPG:] VALIDSIG '+fingerprint not in verification:raise RuntimeError('Onverwachte ondertekenaar: '+a['name'])
 result=a|{'status':'OpenPGP: geldig ondertekend met bestaande organisatiesleutel','fingerprint':fingerprint,'signature_path':str(signature),'signature_sha256':hashlib.file_digest(open(signature,'rb'),'sha256').hexdigest(),'verification_output':verification}
 path.unlink()
 print(a['repo'],a['tag'],a['name'],result['status'],flush=True)
 return result
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(sign,manifest))
(ROOT/'linux-signing-results.json').write_text(json.dumps(results,indent=2))
