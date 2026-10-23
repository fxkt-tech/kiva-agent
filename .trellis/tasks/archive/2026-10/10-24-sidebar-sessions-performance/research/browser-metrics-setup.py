from pathlib import Path
import tempfile, subprocess, json
repo=Path.cwd(); web=repo/'web'
root=Path(tempfile.mkdtemp(prefix='kiva-sidebar-browser-')).resolve()
project=root/'project'; project.mkdir()
(project/'.gitignore').write_text('.kiva\n')
(project/'tracked.txt').write_text('Sidebar browser fixture\n')
def git(*args): return subprocess.check_output(['git','-C',str(project),*args],stderr=subprocess.PIPE)
git('init','-q','-b','fixture-main');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','fixture')
history=project/'.kiva/sessions';history.mkdir(parents=True)
size=0
for index in range(20):
 entries=[json.dumps({'type':'session','version':3,'id':f'measured-{index}','timestamp':'2026-10-24T00:00:00Z','cwd':str(project)}),json.dumps({'type':'session_info','name':f'Measured session {index}'})]
 for i in range(250): entries.append(json.dumps({'type':'message','id':f'entry-{i}','parentId':f'entry-{i-1}' if i else None,'timestamp':'2026-10-24T00:00:00Z','message':{'role':'user','content':'x'*4000}}))
 text='\n'.join(entries)+'\n';(history/f'measured-{index}.jsonl').write_text(text);size+=len(text.encode())
agent=project/'.kiva/agent';agent.mkdir()
(agent/'models.json').write_text(json.dumps({'providers':{'fixture':{'api':'openai-completions','baseUrl':'https://fixture.invalid/v1','apiKey':'offline-browser-fixture','models':[{'id':'controlled','name':'Controlled fixture','contextWindow':100000,'maxTokens':2048,'reasoning':True,'input':['text'],'cost':{'input':0,'output':0,'cacheRead':0,'cacheWrite':0}}]}}}))
(agent/'settings.json').write_text(json.dumps({'defaultProvider':'fixture','defaultModel':'controlled','defaultThinkingLevel':'medium'}))
snapshot=root/'source';snapshot.mkdir();(snapshot/'node_modules').symlink_to(web/'node_modules',target_is_directory=True);(snapshot/'package.json').write_text('{"type":"module"}')
names={'scoped-transport','session-repository','session-catalog'}
import re
for name in names:
 source=subprocess.check_output(['git','show',f'86fc5ce:web/server/{name}.ts'],text=True)
 def change(m):
  spec=m.group(2)
  if spec.startswith('@/'): target=web/spec[2:]
  elif spec.startswith('.'): target=(web/'server'/spec).resolve()
  else:return m.group(0)
  dest=snapshot/target.name if target.parent==web/'server' and target.name in names else target
  return 'from '+m.group(1)+str(dest)+'.ts'+m.group(1)
 (snapshot/f'{name}.ts').write_text(re.sub(r'from ([\"\x27])([^\"\x27]+)\1',change,source))
base='''import {createServer} from "node:http";
import next from "next";
import {WebSocketServer} from "ws";
import {WorkspaceRegistry} from "REGISTRY";
import {SessionRepository} from "REPOSITORY";
import {RuntimeManager} from "MANAGER";
import {createScopedTransport,sendError} from "TRANSPORT";
const root=ROOT;const installation=PROJECT;
const registry=new WorkspaceRegistry(installation);registry.initialize();const project=registry.list()[0];
const repository=new SessionRepository(registry,{worktreeRoot:root+"/worktrees"});
const manager=new RuntimeManager(repository,()=>{throw new Error("Browser metrics must never acquire Pi");});
const host="127.0.0.1",port=Number(process.env.PORT??19498);
const transport=createScopedTransport({registry,repository,manager,allowedOrigins:[`http://${host}:${port}`]});
const app=next({dev:false,dir:WEBROOT,hostname:host,port});await app.prepare();const handle=app.getRequestHandler();
const server=createServer(async(req,res)=>{try{if(req.url==="/__fixture"){res.setHeader("content-type","application/json");res.end(JSON.stringify({root,project}));}else if(!await transport.handle(req,res))await handle(req,res);}catch(e){sendError(res,e);}});
const sockets=new WebSocketServer({noServer:true});server.on("upgrade",(req,socket,head)=>{if(!transport.isEventPath(req)||!transport.allowed(req)){socket.destroy();return;}sockets.handleUpgrade(req,socket,head,c=>void transport.connect(c,req));});
server.listen(port,host,()=>console.log(JSON.stringify({root,port,projectId:project.id})));
let stopping=false;async function stop(){if(stopping)return;stopping=true;sockets.clients.forEach(s=>s.terminate());server.close();server.closeAllConnections();await manager.stop();transport.close();await app.close();}
process.once("SIGINT",()=>void stop());process.once("SIGTERM",()=>void stop());
'''
for mode in ('baseline','after'):
 source=base.replace('REGISTRY',str(web/'server/workspace-registry.ts')).replace('REPOSITORY',str((snapshot if mode=='baseline' else web/'server')/'session-repository.ts')).replace('MANAGER',str(web/'server/runtime-manager.ts')).replace('TRANSPORT',str((snapshot if mode=='baseline' else web/'server')/'scoped-transport.ts')).replace('ROOT',json.dumps(str(root))).replace('PROJECT',json.dumps(str(project))).replace('WEB'+json.dumps(str(root)),json.dumps(str(web)))
 # Replace the independent WEBROOT marker before generic ROOT expansion can alter it.
 source=source.replace('WEBROOT',json.dumps(str(web)))
 (snapshot/f'browser-{mode}.ts').write_text(source)
info={'root':str(root),'project':str(project),'source':str(snapshot),'historyBytes':size,'baselineCommit':'86fc5ce'}
Path('/tmp/kiva-sidebar-browser-fixture.json').write_text(json.dumps(info,indent=2));print(json.dumps(info))
