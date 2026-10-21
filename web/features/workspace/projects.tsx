"use client";

import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { projectUrl } from "./resources";
import { Navigation, useWorkspace } from "./shell";

export function ProjectsFeature() {
  const { projects, openProjectPicker } = useWorkspace();
  return <div className="projects-page"><h2>本地项目</h2><p>选择项目查看会话，或打开本机文件夹。</p><div className="project-directory-list">{projects.map((project) => <Navigation key={project.id} href={`${projectUrl(project.id)}/sessions`} className="project-directory-row"><FolderOpen size={18} /><div><strong>{project.name}</strong><code>{project.path}</code></div></Navigation>)}</div><Button variant="ghost" onClick={openProjectPicker}><Plus size={15} />添加项目</Button></div>;
}
