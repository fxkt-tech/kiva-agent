import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeSlashCommand, insertSlashCommand, matchingSlashCommands, slashCommandsLoaded, slashCommandToken } from "../features/sessions/slash-commands";
import type { RuntimeSlashCommand } from "../shared/runtime-types";

describe("composer slash tokens", () => {
  it("recognizes the caret word while retaining the entire replacement range", () => {
    const value = "请先 /review 保留这些参数";
    assert.deepEqual(slashCommandToken(value, 7), { start: 3, end: 10, query: "rev" });
    assert.deepEqual(slashCommandToken("/skill:tools/review", 19), { start: 0, end: 19, query: "skill:tools/review" });
    assert.equal(slashCommandToken("https://example.invalid/review", 30), null);
    assert.equal(slashCommandToken("hello/review", 12), null);
    assert.equal(slashCommandToken("//server/share", 14), null);
    assert.equal(slashCommandToken("/review args", 12), null);
    assert.equal(slashCommandToken("/review", 2, 5), null);
  });

  it("completes only the token and preserves exact surrounding arguments and whitespace", () => {
    const value = "前文 /rev  参数\r\n后文";
    assert.deepEqual(completeSlashCommand(value, slashCommandToken(value, 7)!, "skill:tools/review"), { text: "前文 /skill:tools/review  参数\r\n后文", caret: 23 });
    assert.deepEqual(completeSlashCommand("/re", slashCommandToken("/re", 3)!, "review"), { text: "/review ", caret: 8 });
    assert.deepEqual(completeSlashCommand("/review arg", slashCommandToken("/review arg", 3)!, "read"), { text: "/read arg", caret: 6 });
  });

  it("starts a shortcut query at the caret without joining or dropping nearby words", () => {
    assert.deepEqual(insertSlashCommand("beforeafter", 6), { text: "before / after", caret: 8 });
    assert.deepEqual(insertSlashCommand("before selected after", 7, 15), { text: "before / after", caret: 8 });
    assert.deepEqual(insertSlashCommand("", 0), { text: "/", caret: 1 });
  });

  it("ranks real names before description matches and retains all matching candidates", () => {
    const commands: RuntimeSlashCommand[] = [
      { source: "extension", name: "check", description: "Review current code" },
      { source: "skill", name: "tools/review" },
      { source: "prompt", name: "review-plan" },
      ...Array.from({ length: 20 }, (_, index) => ({ source: "skill" as const, name: `review-${index}` })),
    ];
    const result = matchingSlashCommands(commands, "REVIEW");
    assert.equal(result.length, 23);
    assert.equal(result[0], commands[2]);
    assert.equal(result.at(-2), commands[1]);
    assert.equal(result.at(-1), commands[0]);
    assert.deepEqual(matchingSlashCommands(commands, "not found"), []);
  });

  it("treats internal-slash paths as text unless an actual command name starts with them", () => {
    const commands: RuntimeSlashCommand[] = [{ source: "skill", name: "skill:team/review" }, { source: "extension", name: "check", description: "/usr/local/bin and skill:team/review" }];
    assert.deepEqual(matchingSlashCommands(commands, "usr/local/bin"), []);
    assert.deepEqual(matchingSlashCommands(commands, "team/rev"), []);
    assert.deepEqual(matchingSlashCommands(commands, "skill:TEAM/rev"), [commands[0]]);
  });

  it("uses runtime provenance and lifecycle before the legacy model-list fallback", () => {
    assert.equal(slashCommandsLoaded(), false);
    assert.equal(slashCommandsLoaded({ models: [] }), false);
    assert.equal(slashCommandsLoaded({ provenance: "live", models: [] }), true);
    assert.equal(slashCommandsLoaded({ provenance: "cached", lifecycle: "starting", models: [] }), true);
    assert.equal(slashCommandsLoaded({ provenance: "persisted", lifecycle: "idle", models: [] }), false);
    assert.equal(slashCommandsLoaded({ lifecycle: "idle", models: [] }), true);
    assert.equal(slashCommandsLoaded({ lifecycle: "dormant", models: [] }), false);
    assert.equal(slashCommandsLoaded({ lifecycle: "starting", models: [] }), false);
  });
});
