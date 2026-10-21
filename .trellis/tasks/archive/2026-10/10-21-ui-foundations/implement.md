# Execution

1. [x] Review approved plan, scoped specs, sibling Vera implementations and dirty baseline. Pin Base UI 1.8.0.
2. [ ] Implement UI primitives and semantic component CSS; document any contract adjustments for consumers.
3. [ ] Migrate settings and shared model fields, composer controls/popovers; retain existing settings/save scope and safeguards.
4. [ ] Migrate project/session menus and dialogs, JSONL, extension prompts and confirmations.
5. [ ] Integrate shared CSS, remove conflicting feature control styles, update interaction tests for public behavior.
6. [ ] Run pnpm typecheck, pnpm test and pnpm web:build; fix new failures, adapt the existing shortcut test to its platform modifier and verify the full suite.
7. [ ] Browser-check nested Select/Dialog Escape and focus, model search/save, dirty/pending guards, menus/dialogs, dark/light desktop/390px/320px, no overflow or unintended paid commands.
8. [ ] Update component ownership/spec contracts and record final validation. Preserve the original next-env.d.ts dirty contents after builds. Do not commit unrelated or pre-existing work.

Rollback is local/reversible: individual feature migrations can be reviewed separately; no API/schema/storage migration is introduced.

Final quality review fixed the Combobox selected-object identity reset under unrelated parent/runtime renders. Settings Toast placement was moved inside the modal so inerting and backdrop order cannot hide it. Full validation is recorded in validation.md. The user subsequently requested commit and push. Commit the validated implementation, archive this task, record the session and push main; preserve the pre-existing generated next-env.d.ts difference locally.
