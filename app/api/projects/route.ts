// app/api/projects/route.ts
// ─── Projects + Tasks API ───
// Returns all projects and tasks from the workspace for the Overview and Projects pages.

import { NextResponse } from 'next/server';
import { getProjects, getTasks, getProjectUrl, checkProjectStatus } from '@/lib/projects';

export async function GET() {
  try {
    const projects = getProjects();
    const tasks = getTasks();

    // Add Vercel URLs and check live status for deployed projects
    const projectsWithStatus = await Promise.all(
      projects.map(async (project) => {
        const url = getProjectUrl(project.id);
        let liveStatus: 'online' | 'offline' | 'unknown' = 'unknown';
        if (url) {
          liveStatus = await checkProjectStatus(url);
        }
        return { ...project, url, liveStatus };
      })
    );

    return NextResponse.json({ projects: projectsWithStatus, tasks });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ projects: [], tasks: [] }, { status: 500 });
  }
}
