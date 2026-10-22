# Pi session reader attribution

The owned React session reader takes its navigation and reading hierarchy from
Pi Coding Agent 1.3.0, particularly the session tree, newest-descendant branch
selection, five tree filters, responsive navigation, pane separator, and
thinking/tool/hidden-message controls in:

- `packages/coding-agent/src/core/export-html/template.js`
- `packages/coding-agent/src/core/export-html/template.css`
- `packages/coding-agent/src/core/export-html/template.html`

Reference source: https://github.com/earendil-works/pi/tree/v1.3.0/packages/coding-agent/src/core/export-html
License source: https://github.com/earendil-works/pi/blob/v1.3.0/LICENSE

The project-owned implementation is in `jsonl-session.ts`, `jsonl-timeline.tsx`,
`jsonl-tree.tsx`, `jsonl-thread.tsx`, and the JSONL rules in `app/globals.css`.
It uses React, the project's source validation, shared Markdown and shared UI
primitives; Pi's HTML exporter and private implementation modules are not loaded
at runtime. Local source identity and ambiguous-data handling intentionally use
the original JSONL line rather than trusting duplicate protocol IDs.

The upstream copyright and permission notice follows:

MIT License

Copyright (c) 2025 Mario Zechner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
