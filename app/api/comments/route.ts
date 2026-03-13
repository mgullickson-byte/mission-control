import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

const baseDir = path.join(process.cwd(), 'data');
const commentsFile = path.join(baseDir, 'comments.json');

export type Comment = {
  id: string;
  projectId: string;
  author: string;
  text: string;
  createdAt: string;
};

const seedComments: Comment[] = [
  {
    id: 'b1c2d3e4-f5a6-4789-9abc-1234567890ab',
    projectId: 'ai-mix-platform',
    author: 'Raimey',
    text: 'Captured the full end-to-end workflow and engineer handoff spec. Next pass should break this into milestone slices we can estimate cleanly.',
    createdAt: '2026-03-13T15:10:00.000Z'
  },
  {
    id: 'c2d3e4f5-a6b7-4890-abcd-2345678901bc',
    projectId: 'ai-mix-platform',
    author: 'Josiah',
    text: 'Engineer handoff package needs to stay explicit: 48kHz/24-bit WAV stems, source assets, and notes on processing decisions.',
    createdAt: '2026-03-13T16:00:00.000Z'
  },
  {
    id: 'd3e4f5a6-b7c8-4901-bcde-3456789012cd',
    projectId: 'mission-control-v1',
    author: 'Raimey',
    text: 'Comments thread should live directly in the project detail card so status, scope, and discussion stay together.',
    createdAt: '2026-03-13T16:20:00.000Z'
  }
];

async function ensureDir() {
  await fs.mkdir(baseDir, { recursive: true });
}

async function readCommentsFile(): Promise<Comment[]> {
  try {
    const raw = await fs.readFile(commentsFile, 'utf8');
    return JSON.parse(raw) as Comment[];
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      await ensureDir();
      await fs.writeFile(commentsFile, JSON.stringify(seedComments, null, 2), 'utf8');
      return seedComments;
    }

    throw err;
  }
}

async function writeCommentsFile(comments: Comment[]) {
  await ensureDir();
  await fs.writeFile(commentsFile, JSON.stringify(comments, null, 2), 'utf8');
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Invalid query: projectId is required' },
        { status: 400 }
      );
    }

    const comments = await readCommentsFile();
    const filtered = comments
      .filter((comment) => comment.projectId === projectId)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

    return NextResponse.json({ comments: filtered });
  } catch (err) {
    console.error('Error reading comments file', err);
    return NextResponse.json({ error: 'Failed to read comments' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<
      Pick<Comment, 'projectId' | 'author' | 'text'>
    >;
    const projectId = body.projectId?.trim();
    const author = body.author?.trim();
    const text = body.text?.trim();

    if (!projectId || !author || !text) {
      return NextResponse.json(
        { error: 'Invalid payload: projectId, author, and text are required' },
        { status: 400 }
      );
    }

    const comments = await readCommentsFile();
    const comment: Comment = {
      id: randomUUID(),
      projectId,
      author,
      text,
      createdAt: new Date().toISOString()
    };

    comments.push(comment);
    await writeCommentsFile(comments);

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    console.error('Error writing comments file', err);
    return NextResponse.json({ error: 'Failed to write comments' }, { status: 500 });
  }
}
