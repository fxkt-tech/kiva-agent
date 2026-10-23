# Commit Plan

Status: user approved the complete work on 2026-10-23 with “提交，合并到main，删除临时分支，推送”. Work commits4dd0279 and3aae5da are created and fast-forward merged into main. Finish task archive/journal bookkeeping, delete the current temporary feature branch, and push main. Preserve the unrelated next-env change.

## 1. OpenAI Settings Work

`feat(web): add ChatGPT authorization to model settings`

Include these complete files:

- `.trellis/spec/kiva-web/frontend/global-settings.md`
- `.trellis/spec/kiva-web/frontend/openai-authorization.md`
- `web/app/globals.css`
- `web/features/settings/api.ts`
- `web/features/settings/dialog.tsx`
- `web/features/settings/openai-authorization.tsx`
- `web/server/fixtures/openai-authorization-server.ts`
- `web/server/installation-settings.ts`
- `web/server/provider-authorization.test.ts`
- `web/server/provider-authorization.ts`
- `web/server/provider-configuration.ts`
- `web/server/scoped-transport.ts`
- `web/server/server.ts`
- `web/server/settings-dialog.test.ts`
- `web/shared/installation-settings.ts`
- `web/shared/provider-authorization.ts`

Include only these task-owned hunks from shared documentation:

- `README.md`: OpenAI / ChatGPT authorization guidance paragraph.
- `.trellis/spec/kiva-web/frontend/index.md`: OpenAI Authorization row.

## 2. Web Shutdown Command and Task Record

`feat(cli): add installation-scoped clear-web command`

Include these complete files:

- `package.json`
- `bin/clear-web.mjs`
- `src/web-process.mjs`
- `test/web-process.test.mjs`
- `.trellis/spec/kiva-web/frontend/web-process-lifecycle.md`
- `.trellis/tasks/10-23-openai-model-settings/check.jsonl`
- `.trellis/tasks/10-23-openai-model-settings/commit-plan.md`
- `.trellis/tasks/10-23-openai-model-settings/design.md`
- `.trellis/tasks/10-23-openai-model-settings/implement.jsonl`
- `.trellis/tasks/10-23-openai-model-settings/implement.md`
- `.trellis/tasks/10-23-openai-model-settings/prd.md`
- `.trellis/tasks/10-23-openai-model-settings/research/openai-auth.md`
- `.trellis/tasks/10-23-openai-model-settings/task.json`
- `.trellis/tasks/10-23-openai-model-settings/verification.md`

Include the remaining task-owned documentation hunks:

- `README.md`: clear-web command and Linux/graceful-shutdown guidance.
- `.trellis/spec/kiva-web/frontend/index.md`: Web Process Lifecycle row.

The second commit records the complete task artifacts, including both user follow-ups, after both product deliverables are present. Stage shared documentation by exact hunks using a temporary index/patch, not a blanket add before the first commit.

## Excluded Existing Work

- `web/next-env.d.ts`: pre-existing user/generated import-path change to `.next/dev/types`; preserved byte-for-byte and excluded from both commits.

## Validation

OpenAI implementation passed355 full tests, typecheck, production build, independent review and isolated/live browser checks. The later exact `agent_name_hint=KivA` literal passed the focused9-test authorization suite and independent mapping/typecheck review. The clear-web follow-up passed11 root tests; independent final combined regression passed361 tests (root11 + Web350), root/Web typecheck and diff-check. The actual service was preserved. See verification.md.

## Authorized Finishing Sequence

The two work commits were created without amend and fast-forward merged into main. The user explicitly authorizes deleting the current temporary feature branch and pushing main after bookkeeping. Then archive only this completed task and record the session through finish-work, producing bookkeeping commits after both work commits. Leave the unrelated bootstrap task and excluded next-env change alone.

Workflow source: `.trellis/workflow.md:626`, “Present the plan once, ask for one-shot confirmation”.
