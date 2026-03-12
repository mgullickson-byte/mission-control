#!/usr/bin/env node

// Push all pipeline SmartReach CSVs to their respective prospect lists.
// Runs push-smartreach-leads.js sequentially for Scout then Echo outputs.

const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT_DIR = process.cwd();
const PUSH_SCRIPT = path.join(ROOT_DIR, 'scripts', 'push-smartreach-leads.js');

const PIPELINES = [
  {
    file: 'leads/select-small-mid-agencies-us-smartreach.csv',
    list: 'Select - Small Mid Agencies'
  },
  {
    file: 'leads/studio-smartreach.csv',
    list: 'Studio Awesome - Brands & Agencies'
  }
];

function runPush(file, list) {
  console.log('');
  console.log(`${'='.repeat(60)}`);
  console.log(`Pipeline: ${file}`);
  console.log(`List    : ${list}`);
  console.log(`${'='.repeat(60)}`);

  const cmd = `node "${PUSH_SCRIPT}" --file "${file}" --list "${list}"`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR });
    return true;
  } catch {
    return false;
  }
}

let anyFailed = false;
for (const { file, list } of PIPELINES) {
  const ok = runPush(file, list);
  if (!ok) anyFailed = true;
}

console.log('');
console.log('All pipelines complete.');
if (anyFailed) {
  console.error('One or more pipelines encountered errors.');
  process.exit(1);
}
