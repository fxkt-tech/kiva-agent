import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <div className="resource-state"><Alert variant="warning" title="找不到此资源"><p>找不到此项目或会话，请检查链接或重新选择项目。</p><div className="alert-actions"><Button asChild size="sm" variant="outline"><a href="/projects">查看项目</a></Button></div></Alert></div>;
}
