import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** No model requests: every probe prompt is handled by these extension commands. */
export default function probe(pi: ExtensionAPI) {
  let allowSwitch = false;
  pi.on("session_start", async (_event, ctx) => {
    writeFileSync(join(process.env.PI_CODING_AGENT_DIR!, "probe-context.json"), JSON.stringify({
      cwd: ctx.cwd, sessionCwd: ctx.sessionManager.getCwd(), sessionId: ctx.sessionManager.getSessionId(), sessionFile: ctx.sessionManager.getSessionFile(),
    }));
  });
  pi.on("session_before_switch", async () => allowSwitch ? undefined : { cancel: true });
  pi.registerCommand("probe-ui", { description: "Fixture extension dialog", handler: async (_args, ctx) => {
    const confirmed = await ctx.ui.confirm("Fixture confirmation", "No model call");
    writeFileSync(join(process.env.PI_CODING_AGENT_DIR!, "probe-response.json"), JSON.stringify({ confirmed }));
  } });
  pi.registerCommand("probe-drift", { description: "Fixture session identity replacement", handler: async (_args, ctx) => {
    allowSwitch = true;
    try { await ctx.newSession(); } finally { allowSwitch = false; }
  } });
}
