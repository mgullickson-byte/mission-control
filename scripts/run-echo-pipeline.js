#!/usr/bin/env node

// Orchestrator for the full Echo Studio Awesome lead pipeline.
// 1. Runs echo-apollo-run.js (Apollo pull + de-dupe for agencies + brands)
// 2. Runs verify-studio-leads.js (MillionVerifier + SmartReach export)

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const AGENCIES_CSV = path.join(LEADS_DIR, 'studio-agencies.csv');
const BRANDS_CSV = path.join(LEADS_DIR, 'studio-brands.csv');
const SMARTREACH_CSV = path.join(LEADS_DIR, 'studio-smartreach.csv');

function countRows(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim() !== '');
  return Math.max(0, lines.length - 1); // subtract header
}

function run(scriptName) {
  const scriptPath = path.join(ROOT_DIR, 'scripts', scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    cwd: ROOT_DIR,
  });
  if (result.error) throw result.error;
  return result.status;
}

async function main() {
  console.log(`=== Echo Pipeline Run: ${new Date().toISOString()} ===`);

  const beforeAgencies = countRows(AGENCIES_CSV);
  const beforeBrands = countRows(BRANDS_CSV);

  console.log('\n--- Step 1: Apollo pull (agencies + brands) ---');
  const apolloStatus = run('echo-apollo-run.js');
  if (apolloStatus !== 0) {
    console.error(`\necho-apollo-run.js exited with code ${apolloStatus}`);
    process.exit(1);
  }

  const afterAgencies = countRows(AGENCIES_CSV);
  const afterBrands = countRows(BRANDS_CSV);
  const newAgencies = afterAgencies - beforeAgencies;
  const newBrands = afterBrands - beforeBrands;
  console.log(`\nApollo: +${newAgencies} agency leads, +${newBrands} brand leads`);

  console.log('\n--- Step 2: Verify + SmartReach export ---');
  const verifyStatus = run('verify-studio-leads.js');
  if (verifyStatus !== 0) {
    console.error(`\nverify-studio-leads.js exited with code ${verifyStatus}`);
    process.exit(1);
  }

  const smartreachCount = countRows(SMARTREACH_CSV);
  console.log(`\nSmartReach-ready: ${smartreachCount} leads`);

  console.log(`\n=== Echo Pipeline complete. New leads: ${newAgencies + newBrands} (+${newAgencies} agency, +${newBrands} brand). SmartReach-ready: ${smartreachCount}. ===`);
  process.exit(0);
}

main().catch(err => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
