import json, os, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
origin = os.environ.get('FIXTURE_ORIGIN', 'http://127.0.0.1:19496')
fixture = json.load(urllib.request.urlopen(origin + '/__fixture'))
root = Path(fixture['root']).resolve()
assert root.name.startswith('kiva-workspace-mode-browser-')
project = fixture['project']
project_root = Path(project['path'])
assert project_root.is_relative_to(root)
(project_root / 'nested').mkdir(exist_ok=True)
(project_root / 'nested' / '中文 文件.txt').write_text('Nested exact path fixture\n')
wide = project_root / 'wide'
wide.mkdir(exist_ok=True)
for i in range(1105):
    (wide / f'file-{i:04}.txt').write_text(f'fixture {i}\n')
artifacts = Path('/tmp/kiva-files-browser')
artifacts.mkdir(exist_ok=True)
errors = []
requests = []
results = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    page.emulate_media(reduced_motion='reduce')
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.on('request', lambda req: requests.append(req.url))
    base = f"/projects/{project['id']}"
    page.goto(origin + base + '/files', wait_until='networkidle')
    tree = page.get_by_role('tree')
    expect(tree).to_be_visible()
    def row(path):
        return page.locator('.workspace-tree-row').and_(page.locator('[data-path=' + json.dumps(path, ensure_ascii=False) + ']'))
    row('nested').click()
    row('nested/中文 文件.txt').click()
    expect(page.locator('.workspace-preview pre')).to_contain_text('Nested exact path fixture')
    row('tracked.txt').click()
    expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted fixture contents')
    page.go_back(wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Nested exact path fixture')
    page.go_forward(wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted fixture contents')
    page.reload(wait_until='networkidle')
    expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted fixture contents')
    row('wide').click()
    expect(row('wide/file-1104.txt')).to_be_attached()
    assert page.locator('.workspace-tree-row[data-kind="file"]').count() >= 1108
    page.get_by_role('button', name='全部折叠', exact=True).click()
    assert page.locator('.workspace-tree-row[data-path="wide/file-1104.txt"]').count() == 0
    row('nested').click()
    row('nested/中文 文件.txt').click()
    page.get_by_role('treeitem', name='nested/中文 文件.txt', exact=True).press('ArrowLeft')
    expect(page.get_by_role('treeitem', name='nested', exact=True)).to_be_focused()
    page.get_by_role('treeitem', name='nested', exact=True).press('ArrowRight')
    expect(page.get_by_role('treeitem', name='nested/中文 文件.txt', exact=True)).to_be_focused()
    for width, color in [(1440, 'light'), (390, 'dark'), (320, 'light')]:
        page.set_viewport_size({'width': width, 'height': 1000})
        page.emulate_media(color_scheme=color)
        if width <= 720:
            expect(page.locator('.sidebar')).to_be_hidden()
        else:
            expect(page.locator('.sidebar')).to_be_visible()
        expect(page.locator('.workspace-preview pre')).to_contain_text('Nested exact path fixture')
        bounds = page.evaluate('({scroll:document.documentElement.scrollWidth, width:innerWidth})')
        assert bounds['scroll'] <= bounds['width'], bounds
        page.screenshot(path=str(artifacts / f'files-{width}-{color}.png'), full_page=True)
        results.append({'width': width, 'color': color, 'bounds': bounds})
    page.set_viewport_size({'width': 1440, 'height': 1000})
    def api(path, body=None):
        return page.evaluate('''async ({path,body}) => {
          const response = await fetch(path, body === null ? undefined : {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
          const data = await response.json(); if(!response.ok) throw new Error(JSON.stringify(data)); return data;
        }''', {'path': path, 'body': body})
    metadata = api('/api' + base)
    assert set(metadata) == {'project'}, metadata.keys()
    workspace = api('/api' + base + '/workspace')
    assert set(workspace) == {'project', 'renderedAt'}, workspace.keys()
    assert len(workspace['project']['files']) >= 1109
    for mode in ['current-branch', 'worktree']:
        session = api('/api' + base + '/sessions', {'operationId': 'browser-files-' + mode, 'workspaceMode': mode})
        sid = session['session']['id']
        session_base = base + '/sessions/' + sid
        page.goto(origin + session_base + '/files?path=tracked.txt', wait_until='networkidle')
        expect(page.get_by_role('tree')).to_be_visible()
        expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted' if mode == 'current-branch' else 'Committed fixture')
        page.goto(origin + session_base + '/changes', wait_until='networkidle')
        if mode == 'current-branch':
            expect(page.get_by_role('tree')).to_be_visible()
            row('tracked.txt').click()
            expect(page.locator('.workspace-preview pre')).to_contain_text('Local uncommitted')
        else:
            expect(page.get_by_text('工作区没有未提交变更', exact=True)).to_be_visible()
        results.append({'mode': mode, 'sessionId': sid, 'verified': True})
    assert not errors, errors
    browser.close()
report = {'origin': origin, 'projectId':project['id'], 'checks':results, 'pageErrors':errors, 'requests':requests, 'screenshots':str(artifacts)}
(artifacts / 'result.json').write_text(json.dumps(report, indent=2, ensure_ascii=False))
print(json.dumps({'checks':results, 'pageErrors':errors, 'fileCount':len(workspace['project']['files']), 'artifacts':str(artifacts)}, ensure_ascii=False))
