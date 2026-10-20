import { legacyCacheRetirementWorker } from "@/lib/legacy-cache-recovery";

export const dynamic = "force-dynamic";

export function GET() {
  return new Response(legacyCacheRetirementWorker, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Service-Worker-Allowed": "/",
    },
  });
}
