#!/usr/bin/env node

// Simple orchestrator for the social campaign monitor.

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT_DIR = process.cwd();

function main() {
  const scriptPath = path.join(ROOT_DIR, 'scripts', 'social-campaign-monitor.js');
  const result = spawnSync(process.execPath, [scriptPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: ROOT_DIR
  });

  if (result.error) {
    console.error('Error running social-campaign-monitor.js:', result.error);
    process.exit(1);
  }

  process.exit(result.status || 0);
}

main();
