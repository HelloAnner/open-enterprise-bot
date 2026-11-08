#!/usr/bin/env python3
# Private reverse proxy on the requested port; no change to cluster NodePort range, Traefik, or shared Docker.
import json,os,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[2]
assert str(root)=='/data/Open Enterprise Bot'
services=json.load(sys.stdin)['items'];ips={s['metadata']['name']:s['spec']['clusterIP'] for s in services}
assert all(name in ips for name in ['frontend','api-gateway','desktop-gateway'])
for ip in ips.values():
 import ipaddress
 ipaddress.ip_address(ip)
conf='''worker_processes 1;
pid /tmp/nginx.pid;
error_log /dev/stderr warn;
events { worker_connections 1024; }
http {
 access_log /dev/stdout;
 client_body_temp_path /tmp/client_temp;
 proxy_temp_path /tmp/proxy_temp;
 fastcgi_temp_path /tmp/fastcgi_temp;
 uwsgi_temp_path /tmp/uwsgi_temp;
 scgi_temp_path /tmp/scgi_temp;
 map $http_upgrade $connection_upgrade { default upgrade; '' close; }
 server {
  listen 8530;
  client_max_body_size 11m;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy same-origin always;
  proxy_set_header Host $http_host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_http_version 1.1;
  proxy_read_timeout 180s;
  location /internal { return 404; }
  location /api/ { proxy_pass http://API:8080; proxy_buffering off; proxy_set_header Connection ''; }
  location /desktop/ { proxy_pass http://DESKTOP:8080; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; }
  location / { proxy_pass http://FRONTEND:8080; }
 }
}
'''.replace('API',ips['api-gateway']).replace('DESKTOP',ips['desktop-gateway']).replace('FRONTEND',ips['frontend'])
path=root/'.state/edge/nginx.conf';staged=path.with_name('nginx.next.conf');staged.write_text(conf)
image=json.loads((root/'.private/images.json').read_text())['frontend']
cmd=['docker','--host','unix:///run/eob-image-builder/docker.sock']
# Validate with the same read-only filesystem before replacing the running proxy.
subprocess.run(cmd+['run','--rm','--network','none','--read-only','--memory','128m','--cpus','0.25','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:size=64m,mode=1777','--mount','type=bind,source='+str(staged)+',target=/etc/nginx/nginx.conf,readonly','--entrypoint','nginx',image,'-t'],check=True)
os.replace(str(staged),str(path))
old=subprocess.run(cmd+['inspect','eob-public-edge'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True)
if old.returncode==0:
 d=json.loads(old.stdout)[0];assert d['Config']['Labels'].get('app.kubernetes.io/part-of')=='open-enterprise-bot'
 subprocess.run(cmd+['rm','-f','eob-public-edge'],check=True)
else:
 listeners=subprocess.check_output(['ss','-H','-lnt'],universal_newlines=True)
 assert not any(line.split()[3].endswith(':8530') for line in listeners.splitlines()),'Port 8530 belongs to another service'
subprocess.run(cmd+['run','-d','--name','eob-public-edge','--label','app.kubernetes.io/part-of=open-enterprise-bot','--restart','unless-stopped','--network','host','--read-only','--memory','128m','--cpus','0.25','--pids-limit','64','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:size=64m,mode=1777','--mount','type=bind,source='+str(path)+',target=/etc/nginx/nginx.conf,readonly','--entrypoint','nginx',image,'-g','daemon off;'],check=True)
subprocess.run(['systemctl','enable','eob-image-builder'],check=True)
