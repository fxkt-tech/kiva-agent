import { SessionFeature } from "@/features/sessions/conversation";
export default async function SessionsPage({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return <SessionFeature projectId={projectId} />; }
