import { ChangesFeature } from "@/features/changes/changes";
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) { return <ChangesFeature target={await params} />; }
