#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = process.cwd();

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    full: args.includes('--full')
  };
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

function main() {
  const { full } = parseArgs();
  const isTestMode = !full;

  console.log(`=== Email Enrichment Pipeline Run: ${new Date().toISOString()} ===`);

  const lookupArgs = full ? [] : ['--file', 'select-small-mid-agencies-us.csv'];
  console.log('\n--- Step 1: Lookup email formats ---');
  const lookupStatus = run('lookup-email-formats.js', lookupArgs);
  if (lookupStatus !== 0) {
    console.error(`\nlookup-email-formats.js exited with code ${lookupStatus}`);
    process.exit(1);
  }

  const enrichArgs = full
    ? []
    : ['--file', 'select-small-mid-agencies-us.csv', '--limit', '20'];

  console.log('\n--- Step 2: Enrich missing emails ---');
  const enrichStatus = run('enrich-missing-emails.js', enrichArgs);
  if (enrichStatus !== 0) {
    console.error(`\nenrich-missing-emails.js exited with code ${enrichStatus}`);
    process.exit(1);
  }

  console.log('');
  console.log(
    isTestMode
      ? '=== Email enrichment test complete. Scope: first 20 missing-email rows from select-small-mid-agencies-us.csv ==='
      : '=== Email enrichment full run complete. ==='
  );
}

main();
