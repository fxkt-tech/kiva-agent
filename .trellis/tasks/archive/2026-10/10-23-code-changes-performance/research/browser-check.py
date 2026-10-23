import json, os, re, subprocess, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
origin = os.environ.get('FIXTURE_ORIGIN', 'http://127.0.0.1:19497')
fixture = json.load(urllib.request.urlopen(origin + '/__fixture'))
root = Path(fixture['root']).resolve()
assert root.name.startswith('kiva-workspace-mode-browser-')
project_root = Path(fixture['project']['path']).resolve()
assert project_root.is_relative_to(root)
project_id = fixture['project']['id']
base = '/projects/' + project_id
api_base = '/api' + base

def git(*args):
    return subprocess.check_output(['git', '-C', str(project_root), *args], stderr=subprocess.PIPE, text=True)
tracked = ['deleted.txt', 'renamed.txt', 'mixed.txt', 'staged.txt', 'literal [x].txt', 'binary.bin']
for name in tracked:
    (project_root / name).write_bytes(b'\0before\n' if name == 'binary.bin' else ('Original ' + name + '\n').encode())
git('add', '--', *tracked)
git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'changes acceptance setup')
(project_root / 'deleted.txt').unlink()
(project_root / 'renamed.txt').rename(project_root / 'destination.txt')
git('add', '-A', '--', 'deleted.txt', 'renamed.txt', 'destination.txt')
(project_root / 'staged.txt').write_text('Staged version\n')
git('add', '--', 'staged.txt')
(project_root / 'mixed.txt').write_text('Index intermediate version\n')
git('add', '--', 'mixed.txt')
(project_root / 'mixed.txt').write_text('Working mixed final version\n')
(project_root / 'literal [x].txt').write_text('Literal bracket change\n')
(project_root / 'binary.bin').write_bytes(b'\0after\n')
(project_root / 'nested').mkdir(exist_ok=True)
(project_root / 'nested' / '中文 文件.txt').write_text('Unicode untracked text\n')
(project_root / 'too-large.txt').write_bytes(b'x' * 2_000_001)
artifacts = Path('/tmp/kiva-changes-browser'); artifacts.mkdir(exist_ok=True)
errors, requests, results = [], [], []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.emulate_media(reduced_motion='reduce')
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append(request.url))
    def row(path):
        return page.locator('.workspace-tree-row').and_(page.locator('[data-path=' + json.dumps(path, ensure_ascii=False) + ']'))
    def api(path, body=None):
        return page.evaluate('''async ({path,body}) => {
          const r=await fetch(path, body===null ? undefined : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
          const d=await r.json();if(!r.ok)throw new Error(JSON.stringify(d));return d;
        }''', {'path':path,'body':body})
    page.goto(origin + base + '/changes?path=tracked.txt', wait_until='networkidle')
    expect(page.get_by_role('tree')).to_be_visible()
    expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted fixture contents')
    scoped_lists=[url for url in requests if url.startswith(origin + api_base + '/workspace')]
    assert scoped_lists and all('view=changes' in url for url in scoped_lists), scoped_lists
    workspace=api(api_base + '/workspace?view=changes')
    assert 'files' not in workspace['project'], workspace['project'].keys()
    assert {entry['path'] for entry in workspace['project']['changes']} >= {'tracked.txt','staged.txt','mixed.txt','deleted.txt','destination.txt','nested/中文 文件.txt'}
    for path, expected in [('staged.txt','Staged version'),('mixed.txt','Working mixed final version'),('deleted.txt','deleted file mode'),('destination.txt','Original renamed.txt'),('literal [x].txt','Literal bracket change'),('binary.bin','Binary files')]:
        row(path).click()
        expect(page.locator('.workspace-preview pre')).to_contain_text(expected)
    row('nested').click()
    row('nested/中文 文件.txt').click()
    expect(page.locator('.workspace-preview pre')).to_contain_text('+Unicode untracked text')
    page.go_back(wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Binary files')
    page.go_forward(wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('+Unicode untracked text')
    row('too-large.txt').click()
    expect(page.locator('.preview-alert')).to_be_visible()
    expect(page.get_by_role('tree')).to_be_visible()
    row('tracked.txt').click()
    expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted fixture contents')
    session=api(api_base + '/sessions', {'operationId':'changes-browser-current','workspaceMode':'current-branch','name':'Refresh probe'})['session']
    sid=session['id']
    # Reload to include the new session in the sidebar; then exercise the real
    # shell refresh action via rename without navigating away from this diff.
    page.reload(wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted fixture contents')
    (project_root / 'tracked.txt').write_text('Refreshed same-path contents\n')
    held=[]
    pattern='**' + api_base + '/changes?path=tracked.txt'
    def hold(route):
        held.append(route)
    page.route(pattern, hold)
    page.get_by_role('button', name='会话操作 Refresh probe', exact=True).click()
    page.get_by_role('menuitem', name='重命名', exact=True).click()
    page.get_by_role('textbox', name='新的会话名称', exact=True).fill('Refresh probe renamed')
    page.get_by_role('button', name='保存名称', exact=True).click()
    expect(page.locator('.workspace-preview-state')).to_contain_text(re.compile('刷新|读取'))
    assert held, 'Expected same-path preview request after shell refresh'
    assert page.locator('.workspace-preview pre').count() == 0, 'Old patch must not look freshly confirmed'
    held[0].continue_()
    expect(page.locator('.workspace-preview pre')).to_contain_text('Refreshed same-path contents')
    page.unroute(pattern, hold)
    results.append({'samePathRefresh':True,'pendingRefreshFeedback':True,'treeAfterError':True})
    for width,color in [(1440,'light'),(390,'dark'),(320,'light')]:
        page.set_viewport_size({'width':width,'height':1000}); page.emulate_media(color_scheme=color)
        if width<=720: expect(page.locator('.sidebar')).to_be_hidden()
        expect(page.locator('.workspace-preview pre')).to_contain_text('Refreshed same-path contents')
        bounds=page.evaluate('({scroll:document.documentElement.scrollWidth,width:innerWidth})')
        assert bounds['scroll']<=bounds['width'], bounds
        page.screenshot(path=str(artifacts/f'changes-{width}-{color}.png'),full_page=True)
        results.append({'width':width,'color':color,'bounds':bounds})
    page.set_viewport_size({'width':1440,'height':1000})
    current_base=base+'/sessions/'+sid
    page.goto(origin+current_base+'/changes?path=tracked.txt',wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Refreshed same-path contents')
    owned=api(api_base+'/sessions',{'operationId':'changes-browser-worktree','workspaceMode':'worktree','name':'Owned probe'})['session']
    owned_root=Path(owned['workspace']['executionRoot']).resolve()
    assert owned_root.is_relative_to(root)
    (owned_root/'tracked.txt').write_text('Owned-only tracked edit\n')
    owned_base=base+'/sessions/'+owned['id']
    page.goto(origin+owned_base+'/changes?path=tracked.txt',wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Owned-only tracked edit')
    assert 'Refreshed same-path contents' not in page.locator('.workspace-preview pre').inner_text()
    page.goto(origin+base+'/files?path=tracked.txt',wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Refreshed same-path contents')
    page.reload(wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Refreshed same-path contents')
    results.append({'currentBranch':True,'worktreeIsolation':True,'ordinaryFilesCompatibility':True})
    assert not errors, errors
    browser.close()
(artifacts/'result.json').write_text(json.dumps({'checks':results,'pageErrors':errors,'requests':requests,'projectId':project_id},indent=2,ensure_ascii=False))
print(json.dumps({'checks':results,'pageErrors':errors,'artifacts':str(artifacts)},ensure_ascii=False))
