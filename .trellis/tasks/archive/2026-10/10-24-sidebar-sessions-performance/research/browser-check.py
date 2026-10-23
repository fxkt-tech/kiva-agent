import os,json,re,subprocess,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
origin=os.environ.get('FIXTURE_ORIGIN','http://127.0.0.1:19499')
fixture=json.load(urllib.request.urlopen(origin+'/__fixture'));root=Path(fixture['root']).resolve();project=fixture['project'];project_root=Path(project['path']).resolve()
assert root.name.startswith('kiva-workspace-mode-browser-') and project_root.is_relative_to(root)
base='/projects/'+project['id'];api='/api'+base
history=project_root/'.kiva/sessions';history.mkdir(parents=True,exist_ok=True)
for i in range(105):
 sid=f'legacy-{i:03}';entries=[{'type':'session','version':3,'id':sid,'timestamp':'2026-10-24T00:00:00Z','cwd':str(project_root)},{'type':'session_info','name':f'Legacy {i:03}'},{'type':'message','id':'first','parentId':None,'timestamp':'2026-10-24T00:00:00Z','message':{'role':'user','content':f'Preview for legacy {i:03}'}}]
 (history/f'{sid}.jsonl').write_text('\n'.join(json.dumps(e) for e in entries)+'\n')
other=root/'other-project';other.mkdir();(other/'.gitignore').write_text('.kiva\n');(other/'tracked.txt').write_text('Other project\n')
def git(directory,*args):return subprocess.check_output(['git','-C',str(directory),*args],stderr=subprocess.PIPE,text=True)
git(other,'init','-q','-b','fixture-main');git(other,'add','.');git(other,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','other')
othist=other/'.kiva/sessions';othist.mkdir(parents=True);(othist/'other.jsonl').write_text(json.dumps({'type':'session','version':3,'id':'other','cwd':str(other)})+'\n'+json.dumps({'type':'session_info','name':'Other session'})+'\n')
errors=[];requests=[];results=[];artifacts=Path('/tmp/kiva-sidebar-browser-check');artifacts.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1000});page.emulate_media(reduced_motion='reduce');page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url))
 def call(path,body=None):return page.evaluate('''async({path,body})=>{const r=await fetch(path,body===null?undefined:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;}''',{'path':path,'body':body})
 def group(name):return page.locator('.project-group').filter(has=page.get_by_role('button',name=re.compile('(?:展开|折叠)项目 '+re.escape(name)+'$')))
 def row(name):return group('project').get_by_role('button',name='会话操作 '+name,exact=True)
 def menu(name,item):row(name).click();page.get_by_role('menuitem',name=item,exact=True).click()
 def rename(old,new):
  menu(old,'重命名');page.get_by_role('textbox',name='新的会话名称',exact=True).fill(new);page.get_by_role('button',name='保存名称',exact=True).click();expect(row(new)).to_be_visible()
 page.goto(origin+base+'/sessions',wait_until='networkidle');expect(group('project').locator('.session-item')).to_have_count(105)
 listed=[u for u in requests if u.startswith(origin+api+'/sessions?collection=active')];assert len(listed)==1,listed
 legacy=call(api+'/sessions?collection=active');assert legacy['collection']=='active' and len(legacy['sessions'])==105
 assert all('controls' not in s for s in legacy['sessions'])
 call('/api/projects',{'path':str(other)});reload_start=len(requests);page.reload(wait_until='networkidle');expect(group('other-project').get_by_role('link',name='Other session',exact=False)).to_be_visible();expect(group('project').locator('.session-item')).to_have_count(105)
 prioritized=[u for u in requests[reload_start:] if '/api/projects/' in u and '?collection=' in u];assert prioritized and project['id'] in prioritized[0],prioritized
 initial_other=len([u for u in requests if '/api/projects/' in u and str(other.name) not in u and '?collection=' in u and project['id'] not in u])
 rename('Legacy 000','Renamed legacy')
 after_other=len([u for u in requests if '/api/projects/' in u and '?collection=' in u and project['id'] not in u]);assert after_other==initial_other,(initial_other,after_other)
 # Collapsing an unrelated project suppresses new list requests during source mutations.
 group('other-project').get_by_role('button',name='折叠项目 other-project',exact=True).click()
 rename('Renamed legacy','Renamed twice')
 assert len([u for u in requests if '/api/projects/' in u and '?collection=' in u and project['id'] not in u])==after_other
 group('other-project').get_by_role('button',name='展开项目 other-project',exact=True).click();expect(group('other-project').get_by_role('link',name='Other session',exact=False)).to_be_visible()
 # Search includes the oldest row, beyond any accidental first-100 cutoff.
 group('project').get_by_role('button',name='项目操作 project',exact=True).click();page.get_by_role('menuitem',name='搜索 project 会话',exact=True).click();page.get_by_role('textbox',name='搜索 project 会话',exact=True).fill('Renamed twice');expect(row('Renamed twice')).to_be_visible();expect(group('project').locator('.session-item')).to_have_count(1)
 page.get_by_role('textbox',name='搜索 project 会话',exact=True).fill('');expect(group('project').locator('.session-item')).to_have_count(105)
 # Raw JSONL remains authoritative after summary-only rows.
 menu('Renamed twice','查看 JSONL');expect(page.get_by_role('dialog',name='会话 JSONL',exact=True)).to_be_visible();page.get_by_role('tab',name='原始文本',exact=True).click();expect(page.locator('.jsonl-tab-panel:visible')).to_contain_text('legacy-000');page.get_by_role('button',name='关闭 JSONL',exact=True).click()
 menu('Renamed twice','归档');expect(row('Renamed twice')).to_have_count(0)
 page.goto(origin+base+'/archive',wait_until='networkidle');expect(row('Renamed twice')).to_be_visible()
 menu('Renamed twice','恢复');expect(row('Renamed twice')).to_have_count(0)
 page.goto(origin+base+'/sessions',wait_until='networkidle');expect(row('Renamed twice')).to_be_visible()
 menu('Renamed twice','删除');dialog=page.get_by_role('dialog',name=re.compile('^删除'));expect(dialog).to_be_visible();expect(dialog.get_by_role('button',name='删除会话',exact=True)).to_be_enabled();dialog.get_by_role('button',name='删除会话',exact=True).click();expect(row('Renamed twice')).to_have_count(0)
 page.goto(origin+base+'/trash',wait_until='networkidle');expect(row('Renamed twice')).to_be_visible();menu('Renamed twice','恢复删除');expect(row('Renamed twice')).to_have_count(0)
 page.goto(origin+base+'/sessions',wait_until='networkidle');expect(row('Renamed twice')).to_be_visible()
 current=call(api+'/sessions',{'operationId':'sidebar-browser-current','workspaceMode':'current-branch','name':'Current empty'})['session'];owned=call(api+'/sessions',{'operationId':'sidebar-browser-owned','workspaceMode':'worktree','name':'Owned empty'})['session']
 page.reload(wait_until='networkidle');expect(row('Current empty')).to_be_visible();expect(row('Owned empty')).to_be_visible();assert len(call(api+'/sessions?collection=active')['sessions'])==107
 menu('Owned empty','删除');owned_dialog=page.get_by_role('dialog',name=re.compile('^删除'));expect(owned_dialog.get_by_role('checkbox',name='同时删除对应的工作区',exact=True)).to_be_checked();owned_dialog.get_by_role('button',name='取消',exact=True).click()
 menu('Current empty','删除');current_dialog=page.get_by_role('dialog',name=re.compile('^删除'));expect(current_dialog).to_contain_text('当前分支的项目文件不会被删除');assert current_dialog.get_by_role('checkbox').count()==0;current_dialog.get_by_role('button',name='取消',exact=True).click()
 page.goto(origin+base+'/changes?path=tracked.txt',wait_until='networkidle');expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted fixture contents');(project_root/'tracked.txt').write_text('Sidebar mutation preserves diff refresh\n');rename('Current empty','Current renamed');expect(page.locator('.workspace-preview pre')).to_contain_text('Sidebar mutation preserves diff refresh')
 page.goto(origin+base+'/files?path=tracked.txt',wait_until='networkidle');expect(page.locator('.workspace-preview pre')).to_contain_text('Sidebar mutation preserves diff refresh')
 page.goto(origin+base+'/sessions/'+current['id'],wait_until='networkidle');expect(row('Current renamed')).to_be_visible();page.go_back(wait_until='networkidle');expect(page.locator('.workspace-preview pre')).to_contain_text('Sidebar mutation preserves diff refresh')
 page.goto(origin+base+'/sessions',wait_until='networkidle')
 for width,color in [(1440,'light'),(390,'dark'),(320,'light')]:
  page.set_viewport_size({'width':width,'height':1000});page.emulate_media(color_scheme=color)
  if width<=720:expect(page.locator('.sidebar')).to_be_hidden();page.get_by_role('button',name='打开导航',exact=True).click()
  expect(row('Current renamed')).to_be_visible();bounds=page.evaluate('({scroll:document.documentElement.scrollWidth,width:innerWidth})');assert bounds['scroll']<=bounds['width'],bounds;page.screenshot(path=str(artifacts/f'sidebar-{width}-{color}.png'),full_page=True)
  if width<=720:page.get_by_role('button',name='关闭导航',exact=True).click();expect(page.locator('.sidebar')).to_be_hidden()
  results.append({'width':width,'color':color,'bounds':bounds})
 assert not errors,errors;browser.close()
report={'checks':results,'pageErrors':errors,'requests':requests,'completeRows':107,'sharedInitialFetch':True,'scopedMutation':True,'searchBeyond100':True,'archiveTrashRestore':True,'jsonl':True,'bothWorkspaceModes':True,'diffRefreshCompatibility':True}
(artifacts/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='requests'},ensure_ascii=False))
