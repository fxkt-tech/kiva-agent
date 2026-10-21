import { SessionCollectionFeature } from "@/features/sessions/collections";
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return <SessionCollectionFeature projectId={projectId} collection="archived" />; }
