import { SessionFeature } from "@/features/sessions/conversation";
export default async function SessionPage({ params }: { params: Promise<{ projectId: string; sessionId: string }> }) { return <SessionFeature {...await params} />; }
