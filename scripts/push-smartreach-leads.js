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

// SmartReach v1 API uses X-API-KEY header + team_id query param.
// Prospects are added via POST /api/v1/prospects?team_id=<id>
// with "list" field in the body — no separate list-create step needed.
function srHeaders(apiKey) {
  return { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' };
}

// Derive push-state file path from the CSV file path.
// e.g. leads/studio-smartreach.csv → leads/studio-smartreach-push-state.json
function statePathFor(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, '.csv');
  return path.join(dir, `${base}-push-state.json`);
}

function loadPushState(stateFile) {
  if (!fs.existsSync(stateFile)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return new Set(Array.isArray(data.pushed) ? data.pushed : []);
  } catch {
    return new Set();
  }
}

function savePushState(stateFile, pushedSet) {
  fs.writeFileSync(stateFile, JSON.stringify({ pushed: Array.from(pushedSet) }, null, 2));
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

  // Load push state — skip already-pushed emails so re-runs only push new leads
  const stateFile = statePathFor(filePath);
  const alreadyPushed = loadPushState(stateFile);

  let skipped = 0;
  let alreadyDone = 0;
  let pushed = 0;
  let errors = 0;

  const newRows = rows.filter(r => {
    const email = (r.email || '').trim().toLowerCase();
    if (!email) return false;
    if (alreadyPushed.has(email)) { alreadyDone++; return false; }
    return true;
  });

  console.log(`Pushing ${newRows.length} new rows from ${path.basename(filePath)} → "${listName}" (${alreadyDone} already pushed, skipping)`);

  for (const row of newRows) {
    const email = (row.email || '').trim();
    const emailKey = email.toLowerCase();

    const body = {
      list: listName,
      first_name: (row.first_name || '').trim(),
      last_name: (row.last_name || '').trim(),
      email,
      company: (row.company_name || '').trim(),
      website: (row.website || '').trim(),
      city: (row.city || '').trim(),
      job_title: (row.title || '').trim(),
      custom_fields: {},
    };

    let isDuplicate = false;
    try {
      const res = await fetch(`${baseUrl}/api/v1/prospects?team_id=${teamId}`, {
        method: 'POST',
        headers: srHeaders(apiKey),
        body: JSON.stringify(body)
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }

      if (!res.ok || (data && data.status === 'error')) {
        // 422 duplicate — already in SmartReach, mark as done (no delay needed)
        if (res.status === 422 || (typeof data === 'object' && /duplicate|already exist/i.test(data.message || ''))) {
          alreadyPushed.add(emailKey);
          skipped++;
          isDuplicate = true;
        } else {
          errors++;
          console.error(`  Error [${email}] status=${res.status}`, typeof data === 'object' ? data.message || data : data);
        }
      } else {
        pushed++;
        alreadyPushed.add(emailKey);
        const id = data && data.data && data.data.prospect && data.data.prospect.id;
        console.log(`  Pushed ${email}${id ? ` (id: ${id})` : ''}`);
      }
    } catch (err) {
      errors++;
      console.error(`  Network error [${email}]`, err.message);
    }

    // Save state every 25 pushes so partial runs are resumable
    if ((pushed + skipped) % 25 === 0) {
      savePushState(stateFile, alreadyPushed);
    }

    // Only rate-limit on actual pushes (not 422 dupes — no need to delay on those)
    if (!isDuplicate) await sleep(200);
  }

  // Final state save
  savePushState(stateFile, alreadyPushed);

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Total rows     : ${rows.length}`);
  console.log(`  Already pushed : ${alreadyDone} (skipped)`);
  console.log(`  No email       : ${skipped}`);
  console.log(`  Pushed now     : ${pushed}`);
  console.log(`  Errors         : ${errors}`);

  return { total: rows.length, alreadyDone, skipped, pushed, errors };
}

pushAll().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
