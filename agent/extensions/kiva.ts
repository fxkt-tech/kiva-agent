import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function kivaExtension(pi: ExtensionAPI) {
  pi.registerCommand("kiva", {
    description: "Show whether the Kiva project extension is active",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Kiva project extension is active.", "info");
    },
  });
}
