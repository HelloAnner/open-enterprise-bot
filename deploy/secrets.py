#!/usr/bin/env python3
# Generate once, preserve across upgrades. Never commit output or put credentials in ConfigMaps.
import base64, hashlib, json, os, pathlib
root=pathlib.Path(os.environ.get('EOB_SECRET_DIR',str(pathlib.Path(__file__).resolve().parent/'.secrets')))
root.mkdir(mode=0o700,exist_ok=True)
path=root/'secrets.json'
if path.exists():
    raise SystemExit(f'{path} already exists; preserving credentials. Edit it explicitly to rotate.')
key=lambda: base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('=')
passwords={s:key() for s in ['postgres','api','control','runtime','desktop','redis','nats']}
tokens={s:key() for s in ['api-gateway','control-plane','agent-runtime','desktop-gateway','node-runtime']}
secrets_list=[]
namespace=os.environ.get('EOB_NAMESPACE','eob')
model_key=pathlib.Path(os.environ['MODEL_API_KEY_FILE']).read_text().strip() if os.environ.get('MODEL_API_KEY_FILE') else os.environ.get('MODEL_API_KEY','')
username=os.environ.get('ADMIN_USERNAME','admin');password=os.environ.get('ADMIN_PASSWORD',key());salt=os.urandom(16)
password_hash='pbkdf2-sha256$'+base64.urlsafe_b64encode(salt).decode().rstrip('=')+'$'+base64.urlsafe_b64encode(hashlib.pbkdf2_hmac('sha256',password.encode(),salt,600000,32)).decode().rstrip('=')
def add(name,values):
    secrets_list.append({'apiVersion':'v1','kind':'Secret','metadata':{'name':name,'namespace':namespace},'type':'Opaque','stringData':values})
add('eob-infra-secret',{'POSTGRES_PASSWORD':passwords['postgres'],'NATS_PASSWORD':passwords['nats'],'REDIS_PASSWORD':passwords['redis']})
add('eob-migration-secret',{'PGPASSWORD':passwords['postgres'],**{f'{s.upper()}_DB_PASSWORD':passwords[s] for s in ['api','control','runtime','desktop']}})
roles={'api-gateway':('api',['api-gateway','agent-runtime','control-plane','desktop-gateway']), 'control-plane':('control',['control-plane','api-gateway','agent-runtime','desktop-gateway']), 'agent-runtime':('runtime',['agent-runtime']), 'desktop-gateway':('desktop',['desktop-gateway','api-gateway','control-plane','node-runtime'])}
for service,(role,peers) in roles.items():
    values={'DATABASE_URL':f'postgres://eob_{role}:{passwords[role]}@postgres:5432/eob?sslmode=disable','SERVICE_TOKENS':json.dumps({s:tokens[s] for s in peers})}
    if service!='desktop-gateway':values['NATS_PASSWORD']=passwords['nats']
    if service=='api-gateway':values.update(AUTH_SIGNING_KEY=key(),VAULT_KEY=base64.b64encode(os.urandom(32)).decode(),ADMIN_USERNAME=username,ADMIN_DISPLAY_NAME=os.environ.get('ADMIN_DISPLAY_NAME','管理员'),ADMIN_PASSWORD_HASH=password_hash)
    if service=='agent-runtime':values['MODEL_API_KEY']=model_key
    if service=='desktop-gateway':values.update(REDIS_URL=f'redis://:{passwords["redis"]}@redis:6379',DESKTOP_SIGNING_KEY=key())
    add(f'eob-{service}-secret',values)
add('eob-node-runtime-secret',{'SERVICE_TOKENS':json.dumps({s:tokens[s] for s in ['node-runtime','desktop-gateway']})})
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:json.dump({'apiVersion':'v1','kind':'List','items':secrets_list},f,indent=2)
with os.fdopen(os.open(root/'access.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600),'w') as f:json.dump({'username':username,'password':password},f)
print(path)
if not model_key:print('MODEL_API_KEY is empty: set it in eob-agent-runtime-secret before real model use.')
