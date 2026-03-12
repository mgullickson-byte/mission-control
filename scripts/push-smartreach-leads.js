#!/usr/bin/env node

// Push pipeline SmartReach CSVs (Scout / Echo outputs) to a named prospect list.
// Usage: node scripts/push-smartreach-leads.js --file <path> --list <name>
// CSV columns: first_name,last_name,email,company_name,website,city,title

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');

function loadEnv() {
  const env = {};
  if (!fs.existsSync(ENV_PATH)) return env;
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let file = null;
  let list = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) file = args[++i];
    else if (args[i] === '--list' && args[i + 1]) list = args[++i];
  }
  return { file, list };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findOrCreateList(baseUrl, apiKey, teamId, listName) {
  const url = `${baseUrl}/api/v1/listProspects?teamId=${teamId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch prospect lists: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const lists = (data.data && data.data.lists) || [];
  const existing = lists.find((l) => l.name === listName);
  if (existing) {
    console.log(`Found existing list "${listName}" (id: ${existing.id})`);
    return existing.id;
  }

  // Create new list
  const createRes = await fetch(`${baseUrl}/api/v1/createProspectList`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ teamId, name: listName })
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create list "${listName}": ${createRes.status} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  const newId = created.data && created.data.list && created.data.list.id;
  if (!newId) throw new Error(`Create list response missing id: ${JSON.stringify(created)}`);
  console.log(`Created new list "${listName}" (id: ${newId})`);
  return newId;
}

async function pushAll() {
  const { file, list: listName } = parseArgs();

  if (!file || !listName) {
    console.error('Usage: node scripts/push-smartreach-leads.js --file <path> --list <name>');
    process.exit(1);
  }

  const filePath = path.isAbsolute(file) ? file : path.join(ROOT_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.error(`Input CSV not found: ${filePath}`);
    process.exit(1);
  }

  const env = loadEnv();
  const apiKey = env.SMARTREACH_API_KEY;
  const baseUrl = (env.SMARTREACH_API_BASE || 'https://api.smartreach.io').replace(/\/$/, '');
  const teamId = parseInt(env.SMARTREACH_TEAM_ID, 10);

  if (!apiKey) { console.error('SMARTREACH_API_KEY not set in .env.local'); process.exit(1); }
  if (!teamId) { console.error('SMARTREACH_TEAM_ID not set in .env.local'); process.exit(1); }

  const raw = fs.readFileSync(filePath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true });

  const listId = await findOrCreateList(baseUrl, apiKey, teamId, listName);

  let skipped = 0;
  let pushed = 0;
  let errors = 0;

  console.log(`Pushing ${rows.length} rows from ${path.basename(filePath)} → "${listName}"`);

  for (const row of rows) {
    const email = (row.email || '').trim();
    if (!email) {
      skipped++;
      continue;
    }

    const body = {
      teamId,
      listId,
      firstName: (row.first_name || '').trim(),
      lastName: (row.last_name || '').trim(),
      email,
      companyName: (row.company_name || '').trim(),
      website: (row.website || '').trim(),
      city: (row.city || '').trim(),
      designation: (row.title || '').trim()
    };

    try {
      const res = await fetch(`${baseUrl}/api/v1/addProspect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }

      if (!res.ok || (data && data.status === 'error')) {
        errors++;
        console.error(`  Error [${email}] status=${res.status}`, typeof data === 'object' ? data.message || data : data);
      } else {
        pushed++;
        const id = data && data.data && data.data.prospect && data.data.prospect.id;
        console.log(`  Pushed ${email}${id ? ` (id: ${id})` : ''}`);
      }
    } catch (err) {
      errors++;
      console.error(`  Network error [${email}]`, err.message);
    }

    await sleep(200);
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Total rows : ${rows.length}`);
  console.log(`  Skipped    : ${skipped} (no email)`);
  console.log(`  Pushed     : ${pushed}`);
  console.log(`  Errors     : ${errors}`);

  return { total: rows.length, skipped, pushed, errors };
}

pushAll().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
