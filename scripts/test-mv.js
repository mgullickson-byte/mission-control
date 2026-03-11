#!/usr/bin/env node

// Quick MillionVerifier test with a fake email

const fs = require('node:fs');
const path = require('node:path');

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
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

async function run() {
  const env = loadEnv();
  const apiKey = env.MV_API_KEY;
  const baseUrl = env.MV_API_URL || 'https://api.millionverifier.com/api';

  if (!apiKey) {
    console.error('MV_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const url = new URL('v3/', base);
  url.searchParams.set('api', apiKey);
  url.searchParams.set('email', 'fake-email-not-real-1234@example.com');
  url.searchParams.set('timeout', '10');

  console.log('Calling MillionVerifier at', url.toString());

  const res = await fetch(url.toString(), {
    method: 'GET'
  });

  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as raw
  }

  console.log('HTTP status:', res.status);
  console.log('Response body:', data);
}

run().catch((err) => {
  console.error('Error calling MillionVerifier', err);
  process.exit(1);
});
