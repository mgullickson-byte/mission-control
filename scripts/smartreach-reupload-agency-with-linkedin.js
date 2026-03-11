#!/usr/bin/env node

// Re-upload all MV-ok, non–catch-all ad-agency producers to SmartReach
// via the v3 /prospects endpoint, including linkedin_url.
// Intention: update existing prospects in-place based on email.

const fs = require('node:fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const INPUT_PATH = path.join(LEADS_DIR, 'apollo-contacts-verified-all.csv');

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

if (!fs.existsSync(INPUT_PATH)) {
  console.error('Input verified CSV not found at', INPUT_PATH);
  process.exit(1);
}

const rawCsv = fs.readFileSync(INPUT_PATH, 'utf8');
const rows = parse(rawCsv, { columns: true, skip_empty_lines: true });

function isNonCatchOkAgency(row) {
  if (row.segment !== 'agency') return false;
  const mvResult = (row.mv_result || '').toLowerCase();
  const mvSub = (row.mv_subresult || '').toLowerCase();
  const ca = (row['Primary Email Catch-all Status'] || '').toLowerCase();
  const email = (row['Email'] || '').trim();
  if (!email) return false;
  if (mvResult !== 'ok') return false;
  if (ca && ca.includes('catch-all')) return false;
  if (mvSub && mvSub.includes('catchall')) return false;
  return true;
}

const candidates = rows.filter(isNonCatchOkAgency);

if (candidates.length === 0) {
  console.error('No suitable agency contacts found to re-upload');
  process.exit(1);
}

async function main() {
  const env = loadEnv();
  const apiKey = env.SMARTREACH_API_KEY;
  const baseUrl = env.SMARTREACH_API_BASE || 'https://api.smartreach.io';
  const teamId = env.SMARTREACH_TEAM_ID;

  if (!apiKey || !teamId) {
    console.error('Missing SMARTREACH_API_KEY or SMARTREACH_TEAM_ID');
    process.exit(1);
  }

  const endpoint = new URL(`/api/v3/prospects?team_id=${encodeURIComponent(teamId)}`, baseUrl).toString();

  const payload = candidates.map((row) => {
    const email = (row['Email'] || '').trim();
    const firstName = (row['First Name'] || '').trim();
    const lastName = (row['Last Name'] || '').trim();
    const company = (row['Company Name'] || '').trim();
    const city = (row['City'] || '').trim();
    const country = (row['Country'] || '').trim() || 'United States';
    const linkedin = (row['Person Linkedin Url'] || '').trim();

    return {
      email,
      first_name: firstName,
      last_name: lastName,
      company,
      city,
      country,
      linkedin_url: linkedin || null,
      custom_fields: {}
    };
  });

  console.log(`Re-uploading ${payload.length} agency producers with linkedin_url to SmartReach v3 API...`);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  console.log('HTTP status:', res.status);
  console.log('Response body:', data);
}

main().catch((err) => {
  console.error('Error re-uploading agency prospects with LinkedIn', err);
  process.exit(1);
});
