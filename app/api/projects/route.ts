import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const baseDir = path.join(process.cwd(), 'data');
const projectsFile = path.join(baseDir, 'projects.json');

export type ProjectStatus = 'Planning' | 'In Progress' | 'Review' | 'Complete';

export type Project = {
  id: string;
  name: string;
  company: 'Select Casting' | 'Studio Awesome' | 'Both';
  description: string;
  status: ProjectStatus;
  progress: number; // 0-100
  tags: string[];
};

type ProjectsPayload = {
  projects: Project[];
};

const seedProjects: ProjectsPayload = {
  projects: [
    {
      id: 'mission-control',
      name: 'Mission Control v1',
      company: 'Both',
      description:
        'Stand up Mission Control with tasks, tools, leads, and project tracking.',
      status: 'In Progress',
      progress: 45,
      tags: ['infrastructure', 'internal', 'priority']
    },
    {
      id: 'select-outbound',
      name: 'Select Casting Outbound Engine',
      company: 'Select Casting',
      description:
        'Build and iterate on a repeatable outbound engine to agencies, in-house brand studios, and production companies.',
      status: 'Planning',
      progress: 10,
      tags: ['leads', 'outbound', 'pipeline']
    },
    {
      id: 'studio-awesome-pipeline',
      name: 'Studio Awesome Pipeline',
      company: 'Studio Awesome',
      description:
        'Define and pursue high-fit brand and agency leads for Studio Awesome.',
      status: 'Planning',
      progress: 5,
      tags: ['studio awesome', 'pipeline']
    }
  ]
};

async function ensureDir() {
  await fs.mkdir(baseDir, { recursive: true });
}

async function readProjectsFile(): Promise<ProjectsPayload> {
  try {
    const raw = await fs.readFile(projectsFile, 'utf8');
    return JSON.parse(raw) as ProjectsPayload;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await ensureDir();
      await fs.writeFile(projectsFile, JSON.stringify(seedProjects, null, 2), 'utf8');
      return seedProjects;
    }
    throw err;
  }
}

async function writeProjectsFile(data: ProjectsPayload) {
  await ensureDir();
  await fs.writeFile(projectsFile, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET() {
  try {
    const data = await readProjectsFile();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error reading projects file', err);
    return NextResponse.json({ error: 'Failed to read projects' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<ProjectsPayload>;
    if (!body.projects) {
      return NextResponse.json(
        { error: 'Invalid payload: projects is required' },
        { status: 400 }
      );
    }

    const data: ProjectsPayload = {
      projects: body.projects
    };

    await writeProjectsFile(data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error writing projects file', err);
    return NextResponse.json({ error: 'Failed to write projects' }, { status: 500 });
  }
}
