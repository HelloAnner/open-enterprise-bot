#!/usr/bin/env python3
# Authentication-edge integration helper, not a public login endpoint. No signing key is sent to the frontend.
# AUTH_SIGNING_KEY=... python3 deploy/auth/issue-session.py USER_ID prints a short-lived cookie header.
import base64,hashlib,hmac,json,os,sys,time
key=os.environ['AUTH_SIGNING_KEY'];user=sys.argv[1]
enc=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
body=enc(json.dumps({'sub':user,'exp':int(time.time())+3600}).encode())
token=body+'.'+enc(hmac.new(key.encode(),body.encode(),hashlib.sha256).digest())
print(f'Set-Cookie: eob_session={token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=3600')
