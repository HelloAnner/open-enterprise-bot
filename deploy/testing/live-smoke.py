#!/usr/bin/env python3
# Real deployed API/model regression check. No model or execution fixtures; only the temporary Bot is removed.
import http.cookiejar, json, pathlib, time, urllib.request, uuid
root=pathlib.Path(__file__).resolve().parents[2]
access=json.loads((root/'.private/access.json').read_text())
base='http://127.0.0.1:8530'
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def request(path, data=None, method=None, headers=None, raw=False):
 headers=dict(headers or {})
 if isinstance(data,dict):data=json.dumps(data).encode();headers['Content-Type']='application/json'
 req=urllib.request.Request(base+path,data,headers,method=method)
 with client.open(req,timeout=30) as response:
  body=response.read()
  return body if raw else json.loads(body) if body else None
request('/api/login',access)
bot=request('/api/bots',{'name':'[自动验收] 文本附件与已读回执','shape':'circle','color':'#111111'})['id']
path='/api/conversations/'+bot
try:
 marker='EOB-'+uuid.uuid4().hex
 content=('验收编号：'+marker+'\n这是用于真实模型回归的上传文件。\n').encode()
 boundary=uuid.uuid4().hex
 body=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="verification.txt"\r\nContent-Type: text/plain\r\n\r\n').encode()+content+('\r\n--'+boundary+'--\r\n').encode()
 uploaded=request(path+'/files',body,headers={'Content-Type':'multipart/form-data; boundary='+boundary})['userMessage']
 assert request(uploaded['url'],raw=True)==content,'download does not match uploaded bytes'
 def wait_reply(previous):
  end=time.monotonic()+100
  while time.monotonic()<end:
   replies=[m for m in request(path+'/messages') if m['from']=='bot']
   if len(replies)>previous:return replies[-1]
   time.sleep(1)
  raise AssertionError('real model did not reply before deadline')
 wait_reply(0)
 request(path+'/messages',{'text':'只回复附件中“验收编号”字段的完整值。'})
 reply=wait_reply(1)
 assert marker in reply.get('text',''),'model did not receive the actual attachment text'
 request(path+'/read',{'messageId':reply['id']},method='PATCH')
 current=next(b for b in request('/api/bots') if b['id']==bot)
 assert current['unread'] is False and current['lastMessageId']==reply['id'],'read receipt was not persisted'
 request(path+'/messages/'+reply['id'],method='DELETE')
 current=next(b for b in request('/api/bots') if b['id']==bot)
 assert current['lastMessageId']!=reply['id'],'deleted message remained the conversation preview'
 assert all(m['id']!=reply['id'] for m in request(path+'/messages')),'message deletion was not persisted'
 print(json.dumps({'real_model_attachment':True,'byte_exact_download':True,'read_receipt':True,'deleted_preview_updated':True,'model':'qwen3.7-max'}))
finally:
 request('/api/bots/'+bot,method='DELETE')
