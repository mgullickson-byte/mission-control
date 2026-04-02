import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const baseDir = path.join(process.cwd(), 'data');
const tasksFile = path.join(baseDir, 'tasks.json');

export type ColumnKey = 'Recurring' | 'Backlog' | 'In Progress' | 'Review' | 'Live Activity';
export type Assignee = 'Mike' | 'OpenClaw' | 'Sub-agent' | 'Scout' | 'Echo' | 'Forge' | 'Quill' | 'Raimey' | 'Radar';

export type Task = {
  id: string;
  title: string;
  description: string;
  assignee: Assignee;
  column: ColumnKey;
  createdAt: string;
};

export type Activity = {
  id: string;
  message: string;
  createdAt: string;
};

type TasksPayload = {
  tasks: Task[];
  activities: Activity[];
};

const seedData: TasksPayload = {
  tasks: [
    {
      id: 'task-seed-1',
      title: 'Draft Mission Control spec',
      description: 'Capture the first version of what Mission Control should be.',
      assignee: 'Mike',
      column: 'Review',
      createdAt: 'Seeded in Mission Control'
    },
    {
      id: 'task-seed-2',
      title: 'Wire up initial tools shell',
      description:
        'Create Linear-style tools UI in Next.js and add a couple of starter tools.',
      assignee: 'OpenClaw',
      column: 'In Progress',
      createdAt: 'Seeded in Mission Control'
    }
  ],
  activities: [
    {
      id: 'activity-seed-1',
      message: 'Seeded Mission Control tasks board.',
      createdAt: 'Seeded in Mission Control'
    }
  ]
};

async function ensureDir() {
  await fs.mkdir(baseDir, { recursive: true });
}

async function readTasksFile(): Promise<TasksPayload> {
  try {
    const raw = await fs.readFile(tasksFile, 'utf8');
    return JSON.parse(raw) as TasksPayload;
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await ensureDir();
      await fs.writeFile(tasksFile, JSON.stringify(seedData, null, 2), 'utf8');
      return seedData;
    }
    throw err;
  }
}

async function writeTasksFile(data: TasksPayload) {
  await ensureDir();
  await fs.writeFile(tasksFile, JSON.stringify(data, null, 2), 'utf8');
}

export async function GET() {
  try {
    const data = await readTasksFile();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error reading tasks file', err);
    return NextResponse.json({ error: 'Failed to read tasks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<TasksPayload>;
    if (!body.tasks || !body.activities) {
      return NextResponse.json(
        { error: 'Invalid payload: tasks and activities are required' },
        { status: 400 }
      );
    }

    const data: TasksPayload = {
      tasks: body.tasks,
      activities: body.activities
    };

    await writeTasksFile(data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error writing tasks file', err);
    return NextResponse.json({ error: 'Failed to write tasks' }, { status: 500 });
  }
}
