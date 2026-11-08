#!/usr/bin/env python3
# Server profile: reuses base resources, but owns no shared StorageClass/Ingress/NodePort.
import json, pathlib, subprocess, sys, yaml
root=pathlib.Path(__file__).resolve().parents[2]
ns='open-enterprise-bot';node='izuf6gnnqxq6ukvd4f04trz'
images=json.loads((root/'.private/images.json').read_text())
model=json.loads((root/'.private/model.json').read_text())
docs=list(yaml.safe_load_all(subprocess.check_output(['k3s','kubectl','kustomize',str(root/'deploy')],universal_newlines=True)))
docs.append(yaml.safe_load((root/'deploy/postgres/migrate.yaml').read_text()))
docs.append({'apiVersion':'v1','kind':'ConfigMap','metadata':{'name':'eob-migrations'},'data':{f'{i:02d}-{name}.sql':(root/path).read_text() for i,(name,path) in enumerate([('gateway','api-gateway/src/infrastructure/schema.sql'),('control','control-plane/src/infrastructure/schema.sql'),('runtime','agent-runtime/src/infrastructure/schema.sql'),('desktop','desktop-gateway/src/infrastructure/schema.sql'),('roles','deploy/postgres/roles.sql')],1)}})
replicas={'api-gateway':2,'control-plane':2,'agent-runtime':3,'desktop-gateway':2,'frontend':1}
volumes={'postgres':('20Gi','70'),'nats':('5Gi','1000'),'redis':('1Gi','999')}
result=[]
for d in docs:
 if not d or d['kind'] in ['StorageClass','Ingress']:continue
 kind=d['kind'];meta=d['metadata'];name=meta['name'];meta.setdefault('labels',{})['app.kubernetes.io/part-of']=ns
 if kind=='Namespace':meta['name']=ns
 else:meta['namespace']=ns
 if kind=='ConfigMap' and name=='eob-config':
  d['data'].update(AUTH_MODE='signed',PUBLIC_ORIGIN='http://47.116.219.16:8530',NATS_URL='nats://nats.'+ns+'.svc.cluster.local:4222',MODEL_BASE_URL=model['base_url'],MODEL_NAME=model['model'],MODEL_TIMEOUT_MS='120000',EXECUTION_ENABLED='false',COMPUTE_NODE_URL='',RUNTIME_CONCURRENCY='4')
 if kind=='Service':
  d['spec']['type']='ClusterIP'
  for p in d['spec']['ports']:p.pop('nodePort',None)
 if kind in ['Deployment','StatefulSet','Job']:
  pod=d['spec']['template']['spec'];pod['nodeSelector']={'kubernetes.io/hostname':node}
  pod['tolerations']=[{'key':'moss.io/env','operator':'Equal','value':'dev-next','effect':'NoSchedule'}]
  pod['automountServiceAccountToken']=False
  if kind=='Deployment':d['spec']['replicas']=replicas[name]
  for c in pod['containers']:
   if name in images:c['image']=images[name]
   elif name in volumes or name=='eob-migrate':c['image']='docker.io/open-enterprise-bot/base-'+c['image']
   c['imagePullPolicy']='Never'
   c.setdefault('resources',{})['limits']={'cpu':'500m','memory':'768Mi' if name=='agent-runtime' else '1Gi' if name=='postgres' else '512Mi'}
  if kind=='StatefulSet':
   claim=d['spec']['volumeClaimTemplates'][0]['spec'];claim['storageClassName']='';claim['volumeName']=ns+'-'+name
 result.append(d)
for name,(size,_) in volumes.items():
 result.append({'apiVersion':'v1','kind':'PersistentVolume','metadata':{'name':ns+'-'+name,'labels':{'app.kubernetes.io/part-of':ns}},'spec':{'capacity':{'storage':size},'accessModes':['ReadWriteOnce'],'persistentVolumeReclaimPolicy':'Retain','storageClassName':'','claimRef':{'namespace':ns,'name':'data-'+name+'-0'},'local':{'path':str(root/'.state'/name)},'nodeAffinity':{'required':{'nodeSelectorTerms':[{'matchExpressions':[{'key':'kubernetes.io/hostname','operator':'In','values':[node]}]}]}}}})
result.append({'apiVersion':'v1','kind':'ResourceQuota','metadata':{'name':'eob-budget','namespace':ns},'spec':{'hard':{'requests.cpu':'4','limits.cpu':'12','requests.memory':'6Gi','limits.memory':'16Gi','requests.storage':'32Gi','pods':'25'}}})
result.append({'apiVersion':'networking.k8s.io/v1','kind':'NetworkPolicy','metadata':{'name':'eob-egress','namespace':ns},'spec':{'podSelector':{},'policyTypes':['Egress'],'egress':[{'to':[{'podSelector':{}}]},{'to':[{'namespaceSelector':{'matchLabels':{'kubernetes.io/metadata.name':'kube-system'}}}],'ports':[{'protocol':'UDP','port':53},{'protocol':'TCP','port':53}]},{'to':[{'ipBlock':{'cidr':'0.0.0.0/0','except':['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','169.254.0.0/16','127.0.0.0/8']}}],'ports':[{'protocol':'TCP','port':443}]}]}})
phase=sys.argv[1] if len(sys.argv)>1 else 'all'
selected=[d for d in result if phase=='all' or (phase=='infra' and d['kind'] not in ['Deployment','Job']) or (phase=='migrate' and d['kind']=='Job') or (phase=='apps' and d['kind']=='Deployment')]
assert all(d['metadata'].get('namespace')==ns for d in selected if d['kind'] not in ['Namespace','PersistentVolume'])
assert not any(d['kind'] in ['Ingress','StorageClass'] for d in selected)
assert {d['metadata']['name']:d['spec']['replicas'] for d in result if d['kind']=='Deployment'}==replicas
print(json.dumps({'apiVersion':'v1','kind':'List','items':selected}))
