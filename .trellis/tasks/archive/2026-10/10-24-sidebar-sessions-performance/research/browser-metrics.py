import os,json,time,statistics,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
origin=os.environ.get('FIXTURE_ORIGIN','http://127.0.0.1:19498');mode=os.environ['SIDEBAR_METRIC_MODE']
info=json.load(urllib.request.urlopen(origin+'/__fixture'));url=origin+'/projects/'+info['project']['id']+'/sessions'
errors=[];samples=[];requests=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(viewport={'width':1440,'height':1000});page.emulate_media(reduced_motion='reduce')
 page.on('pageerror',lambda err:errors.append(str(err)));page.on('request',lambda request:requests.append(request.url))
 page.add_init_script("""window.__sidebarReadyMs=null; const observer=new MutationObserver(()=>{if(document.querySelectorAll('.project-sessions .session-item').length===20){window.__sidebarReadyMs=performance.now();observer.disconnect();}}); observer.observe(document,{childList:true,subtree:true});""")
 for sample in range(36):
  start=time.perf_counter();page.goto(url,wait_until='domcontentloaded');expect(page.locator('.project-sessions .session-item')).to_have_count(20,timeout=30000)
  elapsed=page.evaluate('window.__sidebarReadyMs'); assert elapsed is not None, 'DOM observer did not capture sidebar readiness'
  if sample==0:cold=elapsed
  elif sample>=6:samples.append(elapsed)
  page.wait_for_load_state('networkidle')
 assert not errors,errors
 page.screenshot(path=f'/tmp/kiva-sidebar-{mode}-ready.png',full_page=True);browser.close()
ordered=sorted(samples)
result={'mode':mode,'method':'MutationObserver performance.now at20sidebarrows; assertion polling excluded','processFirstNavigationMs':round(cold,2),'p50Ms':round(ordered[14],2),'p95Ms':round(ordered[28],2),'samples':len(samples),'warmups':5,'timesMs':[round(x,2) for x in samples],'historyBytes':json.loads(Path('/tmp/kiva-sidebar-browser-fixture.json').read_text())['historyBytes'],'url':url,'pageErrors':errors,'sessionsGetCount':len([u for u in requests if '/sessions' in u and '/api/' in u]),'sameFixture':json.loads(Path('/tmp/kiva-sidebar-browser-fixture.json').read_text())['root']}
Path(f'/tmp/kiva-sidebar-browser-{mode}.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
