import { FilesFeature } from "@/features/files/files";
export default async function Page({ params }: { params: Promise<{ projectId: string }> }) { return <FilesFeature target={await params} />; }
