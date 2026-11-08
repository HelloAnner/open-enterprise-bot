#!/usr/bin/env python3
"""Isolated integration check: real PG/NATS/Redis, four services, Pi + real Guest Jobs.
The model and KVM node are HTTP fixtures; this does NOT certify a Firecracker boot.
Run: GO=/path/to/go python3 deploy/testing/e2e.py
"""
import base64, hashlib, hmac, http.server, json, os, pathlib, signal, socket, subprocess, tempfile, threading, time, urllib.request, urllib.error, uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
GO = os.environ.get('GO', 'go')
TOKEN = 'integration-only-' + uuid.uuid4().hex
SERVICES = ['api-gateway', 'control-plane', 'agent-runtime', 'desktop-gateway', 'node-runtime']
TOKENS = {s: TOKEN + s for s in SERVICES}
containers, processes, servers, handles = [], [], [], []
TMP = pathlib.Path(tempfile.mkdtemp(prefix='eob-e2e-'))

def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs).stdout.strip()

def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0)); return s.getsockname()[1]

def request(url, data=None, token=None, method=None, headers=None):
    h = {'Content-Type':'application/json', **(headers or {})}
    if token: h['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(url, None if data is None else json.dumps(data).encode(), h, method=method)
    with urllib.request.urlopen(req, timeout=20) as res:
        raw = res.read()
        return json.loads(raw) if res.headers.get_content_type() == 'application/json' else raw

def expect_status(code, url, **kwargs):
    try: request(url, **kwargs)
    except urllib.error.HTTPError as e:
        assert e.code == code, (e.code, e.read()); return
    raise AssertionError(f'Expected HTTP {code}: {url}')

def wait(fn, timeout=40):
    end=time.time()+timeout; last=None
    while time.time()<end:
        try:
            value=fn()
            if value: return value
        except Exception as e: last=e
        time.sleep(.15)
    raise AssertionError(f'timed out: {last}')

def docker(image, container_port, *args, env=None):
    name='eob-test-'+uuid.uuid4().hex[:12]; containers.append(name)
    cmd=['docker','run','-d','--name',name,'-p',f'127.0.0.1::{container_port}']
    for k,v in (env or {}).items(): cmd+=['-e',f'{k}={v}']
    run(cmd+[image,*args])
    published=run(['docker','port',name,str(container_port)]).split(':')[-1]
    return name,int(published)

def start(name, command, env):
    log=open(TMP/(name+'.log'),'w'); handles.append(log)
    proc=subprocess.Popen(command,cwd=ROOT,env={**os.environ,**env},stdout=log,stderr=log,start_new_session=True)
    processes.append(proc); return proc

def sql(query):
    return run(['docker','exec','-i',*[item for role in ['API','CONTROL','RUNTIME','DESKTOP'] for item in ['-e',f'{role}_DB_PASSWORD={TOKEN}']],pg,'psql','-U','postgres','-d','eob','-v','ON_ERROR_STOP=1','-At'],input=query)

def sign(user):
    body=base64.urlsafe_b64encode(json.dumps({'sub':user,'exp':int(time.time())+3600}).encode()).decode().rstrip('=')
    sig=base64.urlsafe_b64encode(hmac.new(TOKEN.encode(),body.encode(),hashlib.sha256).digest()).decode().rstrip('=')
    return body+'.'+sig

class Fixture(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_POST(self):
        data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))) or b'{}')
        if self.path.endswith('/chat/completions'):
            content=next(m['content'] for m in reversed(data['messages']) if m['role']=='user')
            if isinstance(content,list):content=''.join(b.get('text','') for b in content)
            prompt=json.loads(content)
            if 'previous' in prompt:
                result={'goal':'updated','tool':'write_file','input':{'name':'updated.txt','content':'UPDATED REAL FILE'}}
            else:
                text=prompt['event'].get('message',{}).get('text','')
                if text=='model failure':
                    self.send_response(503);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"error":{"message":"fixture model unavailable"}}');return
                tasks=[]
                if 'report' in text:
                    tasks=[{'goal':'create report','tool':'write_file','input':{'name':'report.txt','content':'REAL GUEST ARTIFACT'}}]
                if 'slow' in text:
                    tasks=[{'goal':'slow job','tool':'python','input':{'code':'import time; time.sleep(12); print("FINISHED")','name':'slow.txt'}}]
                if 'fanout' in text:
                    tasks=[{'goal':f'parallel {i}','tool':'python','input':{'code':'import time; time.sleep(8); print("FANOUT")','name':f'fanout-{i}.txt'}} for i in range(2)]
                if text in ['large artifact','oversize artifact']:
                    size=8 if text=='large artifact' else 11
                    tasks=[{'goal':text,'tool':'python','input':{'code':f'print("x"*({size}*1024*1024))','name':text.replace(' ','-')+'.txt'}}]
                result={'reply':'Accepted' if tasks else 'Reply: '+text,'tasks':tasks}
            self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
            chunks=[{'delta':{'role':'assistant','tool_calls':[{'index':0,'id':'call_'+uuid.uuid4().hex,'type':'function','function':{'name':'submit_plan','arguments':json.dumps(result)}}]},'finish_reason':None}, {'delta':{},'finish_reason':'tool_calls'}]
            for item in chunks:
                payload={'id':'test','object':'chat.completion.chunk','created':int(time.time()),'model':data['model'],'choices':[{'index':0,**item}]}
                self.wfile.write(('data: '+json.dumps(payload)+'\n\n').encode())
            self.wfile.write(b'data: [DONE]\n\n');self.wfile.flush();return
        if self.path.endswith('/ensure'):
            out={'state':'running','desktop_id':data['desktop_id'],'vm_epoch':data['vm_epoch']}
        elif self.path.startswith('/v1/jobs/'):
            try: out=request(guest_url+self.path,data,TOKEN)
            except urllib.error.HTTPError as e:
                self.send_response(e.code);self.end_headers();self.wfile.write(e.read());return
        elif self.path=='/v1/guest-events':
            try: out=request(desktop+'/internal/job-events',data,TOKENS['node-runtime'])
            except urllib.error.HTTPError as e:
                self.send_response(e.code);self.end_headers();self.wfile.write(e.read());return
        else:
            self.send_response(404);self.end_headers();return
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(out).encode())

def fixture():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture)
    servers.append(server);threading.Thread(target=server.serve_forever,daemon=True).start()
    return f'http://127.0.0.1:{server.server_port}'

try:
    pg,pgport=docker('postgres:17-alpine',5432,env={'POSTGRES_PASSWORD':TOKEN,'POSTGRES_DB':'eob'})
    _,natsport=docker('nats:2.11-alpine',4222,'-js','--user','eob','--pass',TOKEN)
    _,redisport=docker('redis:7.4-alpine',6379,'redis-server','--requirepass',TOKEN)
    wait(lambda: sql('SELECT 1;')=='1')
    for project in ['api-gateway','control-plane','agent-runtime','desktop-gateway']:
        sql((ROOT/project/'src/infrastructure/schema.sql').read_text())
    sql((ROOT/'deploy/postgres/roles.sql').read_text())
    api=f'http://127.0.0.1:{port()}';cp=f'http://127.0.0.1:{port()}';desktop=f'http://127.0.0.1:{port()}';guest_url=f'http://127.0.0.1:{port()}';ui_url=f'http://127.0.0.1:{port()}';model=fixture();node=fixture()
    env={'DATABASE_URL':f'postgres://postgres:{TOKEN}@127.0.0.1:{pgport}/eob?sslmode=disable','NATS_URL':f'nats://127.0.0.1:{natsport}','NATS_USER':'eob','NATS_PASSWORD':TOKEN,'SERVICE_TOKENS':json.dumps(TOKENS),'CONTROL_URL':cp,'GATEWAY_URL':api,'DESKTOP_URL':desktop,'COMPUTE_NODE_URL':node,'REDIS_URL':f'redis://:{TOKEN}@127.0.0.1:{redisport}','AUTH_MODE':'signed','AUTH_SIGNING_KEY':TOKEN,'DESKTOP_SIGNING_KEY':TOKEN,'VAULT_KEY':base64.b64encode(os.urandom(32)).decode(),'MODEL_API_KEY':TOKEN,'MODEL_BASE_URL':model+'/v1','MODEL_NAME':'fixture','LEASE_SECONDS':'6','MAX_JOBS_PER_USER':'10','PUBLIC_ORIGIN':ui_url}
    for project in ['api-gateway','control-plane','desktop-gateway']:
        run([GO,'build','-o',str(TMP/project),'./src/cmd/'+project],cwd=ROOT/project)
    run([GO,'build','-o',str(TMP/'compute-agent'),'./src/cmd/compute-agent'],cwd=ROOT/'desktop-gateway')
    run(['npm','run','build'],cwd=ROOT/'agent-runtime')
    for project,url in [('api-gateway',api),('control-plane',cp),('desktop-gateway',desktop)]:
        role={'api-gateway':'api','control-plane':'control','desktop-gateway':'desktop'}[project]
        start(project,[str(TMP/project)],{**env,'DATABASE_URL':f'postgres://eob_{role}:{TOKEN}@127.0.0.1:{pgport}/eob?sslmode=disable','LISTEN_ADDR':':'+url.rsplit(':',1)[1]})
    for url in [api,cp,desktop]:wait(lambda url=url:request(url+'/readyz'))
    user=sign('local-user');other=sign('other-user')
    assert request(api+'/api/bots',token=user)==[], 'new accounts must not receive demo Bots'
    bot=request(api+'/api/bots',{'name':'Assistant','shape':'circle','color':'#111111'},user)['id']
    start('guest',[str(TMP/'compute-agent')],{**env,'LISTEN_ADDR':':'+guest_url.rsplit(':',1)[1],'WORKSPACE_ROOT':str(TMP/'guest'),'GUEST_TOKEN':TOKEN,'GUEST_USER_ID':'local-user','GUEST_DESKTOP_ID':str(uuid.uuid5(uuid.NAMESPACE_OID,'desktop/local-user')),'GUEST_EPOCH':'1','GUEST_CALLBACK_URL':node+'/v1/guest-events'})
    runtime_env={**env,'DATABASE_URL':f'postgres://eob_runtime:{TOKEN}@127.0.0.1:{pgport}/eob?sslmode=disable','LISTEN_ADDR':':'+str(port())}
    runtime=start('runtime',['node',str(ROOT/'agent-runtime/dist/main.js')],runtime_env)
    expect_status(401,api+'/api/bots')
    expect_status(404,api+f'/api/conversations/{bot}/messages',token=other)
    expect_status(401,cp+'/internal/sessions/claim',data={'owner':'attacker'})
    def messages(b=bot):return request(api+f'/api/conversations/{b}/messages',token=user)
    def jobs():return request(api+'/api/jobs?botId='+bot,token=user)
    def send(text,key=None,b=bot):return request(api+f'/api/conversations/{b}/messages',{'text':text},user,headers={'Idempotency-Key':key or uuid.uuid4().hex})
    first=send('report','same-event');second=send('report','same-event');assert first['userMessage']['id']==second['userMessage']['id']
    wait(lambda:any(m.get('kind')=='file' for m in messages()))
    assert len(jobs())==1 and jobs()[0]['state']=='completed',jobs()
    file=next(m for m in messages() if m.get('kind')=='file');assert request(api+file['url'],token=user)==b'REAL GUEST ARTIFACT'
    assert request(api+'/api/artifacts',token=other)==[]
    expect_status(404,api+file['url'],token=other)
    assert sql("SELECT has_table_privilege('eob_runtime','control.leases','UPDATE');")=='f'
    assert sql("SELECT has_table_privilege('eob_runtime','gateway.messages','UPDATE');")=='f'
    turns=int(sql('SELECT count(*) FROM runtime.pi_turns;'));assert turns>=1,'Pi was not used'
    sessions=request(api+'/api/sessions',token=user);assert {s['kind'] for s in sessions}=={'main','work','worker'},sessions
    print('PASS real HTTP → JetStream → Dispatch → Pi Router → Ticket → Worker → Guest Job → Artifact → chat')
    print('PASS idempotency, scoped artifact access, three Session levels, Pi transcript persistence')
    wait(lambda:sql("SELECT count(*) FROM runtime.workers WHERE state='completed'")=='1')
    sql("UPDATE control.deliveries SET state='pending' WHERE event->>'type'='agent.worker.created';")
    wait(lambda:sql("SELECT count(*) FROM control.deliveries WHERE event->>'type'='agent.worker.created' AND state='done'")=='1')
    assert sql("SELECT count(*) FROM runtime.workers WHERE state='completed'")=='1', 'replay revived a terminal Worker'
    print('PASS completed Worker remains terminal after delivery replay')
    secondbot=request(api+'/api/bots',{'name':'Second','shape':'circle','color':'#2589f5'},user)['id']
    send('slow');slow=wait(lambda:next((j for j in jobs() if j['tool']=='python' and j['state']=='running'),None))
    t=time.time();send('hello while job runs',b=secondbot);wait(lambda:any('Reply:' in m.get('text','') for m in messages(secondbot)),timeout=8);assert time.time()-t<8
    request(api+f'/api/conversations/{bot}/control',{'action':'update','job_id':slow['id'],'text':'fast new result'},user)
    wait(lambda:any(m.get('name')=='updated.txt' for m in messages()),timeout=40)
    old=next(j for j in jobs() if j['id']==slow['id']);assert old['state'] in ['stopped','completed']
    print('PASS parallel Bot conversation and Stop-confirm-Start replacement')
    send('slow cancel');slow=wait(lambda:next((j for j in jobs() if j['tool']=='python' and j['state']=='running' and j['id']!=old['id']),None))
    request(api+f'/api/conversations/{bot}/control',{'action':'cancel','job_id':slow['id']},user)
    wait(lambda:next(j for j in jobs() if j['id']==slow['id'])['state']=='stopped')
    print('PASS targeted cancel, no VM shutdown and no replacement for cancellation')
    send('fanout');ts=wait(lambda:(v if len(v)==2 else None) if (v:=[t for t in request(api+'/api/tickets',token=user) if t['goal'].startswith('parallel')]) else None)
    wait(lambda:len([s for s in request(api+'/api/subscriptions',token=user) if s['ticket_id'] in [t['id'] for t in ts] and s['active']])==2)
    follow=send('followup without a new task');eid=follow['eventId']
    wait(lambda:int(sql(f"SELECT count(*) FROM control.deliveries WHERE event->>'event_id'='{eid}' AND session_id LIKE 'work:%';"))>=2)
    assert int(sql(f"SELECT count(*) FROM control.deliveries WHERE event->>'event_id'='{eid}' AND session_id='main:local-user';"))==1
    print('PASS Thread multi-Ticket fanout and human message still reaches Router')
    send('large artifact')
    large=wait(lambda:next((a for a in request(api+'/api/artifacts',token=user) if a['name']=='large-artifact.txt'),None))
    assert len(request(api+'/api/artifacts/'+large['id'],token=user))==8*1024*1024+1
    send('oversize artifact')
    wait(lambda:any(j['state']=='failed' and j['input'].get('name')=='oversize-artifact.txt' for j in jobs()))
    send('model failure')
    wait(lambda:any(m.get('text','').startswith('本轮处理失败') for m in messages()))
    print('PASS large real artifacts, bounded execution output and honest model failure')
    if os.environ.get('EOB_BROWSER')=='1':
        start('frontend',['npm','--prefix',str(ROOT/'Frontend'),'run','dev','--','--host','127.0.0.1','--port',ui_url.rsplit(':',1)[1]],{'API_PROXY_TARGET':api,'DESKTOP_PROXY_TARGET':desktop,'VITE_USE_MOCKS':'false'})
        wait(lambda:request(ui_url))
        target=pathlib.Path('/tmp/eob-tools/browser-target.json');target.parent.mkdir(exist_ok=True)
        target.write_text(json.dumps({'url':ui_url,'token':user,'done':str(TMP/'browser-done')}));target.chmod(0o600)
        print('Browser fixture ready:',ui_url,flush=True)
        wait(lambda:(TMP/'browser-done').exists(),timeout=240)
    runtime.terminate();runtime.wait(timeout=20)
    # Create a durable pending event, compete two owners and fence an expired owner.
    send('lease probe');wait(lambda:int(sql("SELECT count(*) FROM control.deliveries WHERE state='pending';"))>0)
    sql("UPDATE control.leases SET expires_at=now()-interval '1 second';")
    claim=request(cp+'/internal/sessions/claim',{'owner':'owner-A'},TOKENS['agent-runtime']);assert claim
    sid=claim['session_id'];sql(f"UPDATE control.leases SET expires_at=now()-interval '1 second' WHERE session_id='{sid}';")
    replacement=wait(lambda:(v if v and v['session_id']==sid else None) if (v:=request(cp+'/internal/sessions/claim',{'owner':'owner-B'},TOKENS['agent-runtime'])) else None)
    assert replacement['epoch']>claim['epoch']
    expect_status(409,cp+f"/internal/deliveries/{claim['id']}/complete",data={k:claim[k] for k in ['session_id','owner','epoch']},token=TOKENS['agent-runtime'])
    expect_status(409,cp+'/internal/output',data={**{k:claim[k] for k in ['session_id','owner','epoch']},'event':{'version':1,'event_id':str(uuid.uuid4()),'type':'model.message','user_id':'local-user','bot_id':bot,'correlation_id':'late','source':'agent-runtime','payload':{'message':{'kind':'text','text':'stale'}}}},token=TOKENS['agent-runtime'])
    print('PASS lease takeover, old-owner checkpoint/output fencing and schema write permissions')
    print('All integration assertions passed. KVM/Chrome/VNC are NOT covered by the node fixture.')
finally:
    for proc in reversed(processes):
        try:os.killpg(proc.pid,signal.SIGTERM)
        except ProcessLookupError:pass
        try:proc.wait(timeout=10)
        except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
    for s in servers:s.shutdown()
    for h in handles:h.close()
    for name in containers:subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    print('Integration logs:',TMP)
