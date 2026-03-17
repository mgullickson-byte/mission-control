#!/usr/bin/env node

// Orchestrator for the new producers pipeline.
// 1. Apollo pull
// 2. MillionVerifier + SmartReach export
// 3. Push verified leads to SmartReach

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const APOLLO_CSV = path.join(LEADS_DIR, 'new-producers-contacts.csv');
const SMARTREACH_CSV = path.join(LEADS_DIR, 'new-producers-smartreach.csv');

function countRows(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim() !== '');
  return Math.max(0, lines.length - 1);
}

function run(scriptName, extraArgs = []) {
  const scriptPath = path.join(ROOT_DIR, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    stdio: 'inherit',
    cwd: ROOT_DIR
  });
  if (result.error) throw result.error;
  return result.status;
}

async function main() {
  console.log(`=== New Producers Pipeline Run: ${new Date().toISOString()} ===`);

  const beforeCount = countRows(APOLLO_CSV);

  console.log('\n--- Step 1: Apollo pull ---');
  const apolloStatus = run('new-producers-apollo-run.js');
  if (apolloStatus !== 0) {
    console.error(`\nnew-producers-apollo-run.js exited with code ${apolloStatus}`);
    process.exit(1);
  }

  const afterApolloCount = countRows(APOLLO_CSV);
  const newLeads = afterApolloCount - beforeCount;
  console.log(`\nApollo: +${newLeads} new leads`);

  console.log('\n--- Step 2: Verify + SmartReach export ---');
  const verifyStatus = run('verify-new-producers.js');
  if (verifyStatus !== 0) {
    console.error(`\nverify-new-producers.js exited with code ${verifyStatus}`);
    process.exit(1);
  }

  const smartreachCount = countRows(SMARTREACH_CSV);
  console.log(`\nSmartReach-ready: ${smartreachCount} leads`);

  console.log('\n--- Step 3: Push to SmartReach ---');
  const pushStatus = run('push-smartreach-leads.js', [
    '--file', path.join('leads', 'new-producers-smartreach.csv'),
    '--list', 'New Producers - SC + SA'
  ]);
  if (pushStatus !== 0) {
    console.error(`\npush-smartreach-leads.js exited with code ${pushStatus}`);
    process.exit(1);
  }

  console.log(`\n=== Pipeline complete. New leads: ${newLeads}. SmartReach-ready: ${smartreachCount}. Push done. ===`);
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
