import { ChangesFeature } from "@/features/changes/changes";
export default async function Page({ params }: { params: Promise<{ projectId: string; sessionId: string }> }) { return <ChangesFeature target={await params} />; }
