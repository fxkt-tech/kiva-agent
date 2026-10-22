# Proposed commits

Status: user confirmed this batch with “提交&推送” on 2026-10-22 and authorized pushing the current `feat/swiss-theme` branch after the commits.

## 1. `feat(web): add Swiss visual style`

Add the independently selectable Swiss style, shared style admission and presentation roles; preserve flat/neumorphic defaults and appearance lifecycle. Include the regression coverage, executable contracts and completed task evidence.

Product and regression files:

- `web/shared/web-preferences.ts`
- `web/lib/web-preferences.ts`
- `web/lib/theme-bootstrap.ts`
- `web/features/settings/preferences-panels.tsx`
- `web/styles/themes.css`
- `web/app/globals.css`
- `web/components/ui/button.tsx`
- `web/components/ui/primitives.css`
- `web/server/web-preferences.test.ts`
- `web/server/theme-bootstrap.test.ts`
- `web/server/settings-dialog.test.ts`
- `web/server/workbench-interactions.test.ts`

Executable specifications:

- `.trellis/spec/kiva-web/frontend/theme-system.md`
- `.trellis/spec/kiva-web/frontend/global-settings.md`
- `.trellis/spec/kiva-web/frontend/component-guidelines.md`
- `.trellis/spec/kiva-web/frontend/visual-system.md`

Task artifacts:

- `.trellis/tasks/10-22-swiss-theme/task.json`
- `.trellis/tasks/10-22-swiss-theme/prd.md`
- `.trellis/tasks/10-22-swiss-theme/design.md`
- `.trellis/tasks/10-22-swiss-theme/implement.md`
- `.trellis/tasks/10-22-swiss-theme/implement.jsonl`
- `.trellis/tasks/10-22-swiss-theme/check.jsonl`
- `.trellis/tasks/10-22-swiss-theme/research/current-behavior.md`
- `.trellis/tasks/10-22-swiss-theme/verification.md`
- `.trellis/tasks/10-22-swiss-theme/commit-plan.md`

Validation: 103 focused tests; 309 full tests; typecheck; fresh production build; independent Trellis review; Swiss light/dark browser matrix at 1440/390/320; 12 old-style cases/372 computed samples with no differences; shared primitives, appearance lifecycle and resource previews. Details are in `verification.md`.

## 2. `chore(task): archive 10-22-swiss-theme`

After the work commit, use the Trellis archive command to move this task to `.trellis/tasks/archive/2026-10/10-22-swiss-theme/` and record its completion/work commit. Leave the independent bootstrap task active.

## 3. `chore: record journal`

Use the Trellis session recorder after archiving. Expected paths:

- `.trellis/workspace/Justyer/journal-1.md`
- `.trellis/workspace/Justyer/index.md`

## Unrelated dirty file excluded

- `web/next-env.d.ts`: pre-existing user edit, preserved byte-for-byte and excluded from every commit.

Temporary browser projects, screenshots, scripts, logs and the retained production-cache backup are outside the repository. After the planned commits, push `feat/swiss-theme` to origin under the user's “提交&推送” instruction. Merging and branch deletion are outside this instruction.

Workflow source: `.trellis/workflow.md`, Phase 3.4, “Present the plan once, ask for one-shot confirmation”. The user's “提交&推送” reply supplies that confirmation and additionally authorizes the push.
