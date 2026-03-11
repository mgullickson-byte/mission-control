#!/usr/bin/env node

// Add a single test prospect to SmartReach using the REST API
// Uses the first MV-ok, non–catch-all agency contact from apollo-contacts-verified-all.csv

const fs = require('node:fs');
const path = require('node:path');
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

const raw = fs.readFileSync(INPUT_PATH, 'utf8');
const rows = parse(raw, { columns: true, skip_empty_lines: true });

function isNonCatchOkAgency(row) {
  if (row.segment !== 'agency') return false;
  const mvResult = (row.mv_result || '').toLowerCase();
  const mvSub = (row.mv_subresult || '').toLowerCase();
  const ca = (row['Primary Email Catch-all Status'] || '').toLowerCase();
  const email = row['Email'] || '';
  if (!email) return false;
  if (mvResult !== 'ok') return false;
  if (ca && ca.includes('catch-all')) return false;
  if (mvSub && mvSub.includes('catchall')) return false;
  return true;
}

const candidates = rows.filter(isNonCatchOkAgency);

if (candidates.length === 0) {
  console.error('No suitable agency contacts found to push to SmartReach');
  process.exit(1);
}

const row = candidates[0];

async function main() {
  const env = loadEnv();
  const apiKey = env.SMARTREACH_API_KEY;
  const baseUrl = env.SMARTREACH_API_BASE || 'https://api.smartreach.io';
  const listName = env.SMARTREACH_SMALL_MID_LIST || 'Small & Midsize Ad Agencies';
  const teamId = env.SMARTREACH_TEAM_ID;

  if (!apiKey) {
    console.error('SMARTREACH_API_KEY is not set in .env.local');
    process.exit(1);
  }

  if (!teamId) {
    console.error(
      'SMARTREACH_TEAM_ID is not set in .env.local. Please follow SmartReach "Team Identification" docs to find your team_id and add:\nSMARTREACH_TEAM_ID=YOUR_TEAM_ID'
    );
    process.exit(1);
  }

  const firstName = (row['First Name'] || '').trim();
  const lastName = (row['Last Name'] || '').trim();
  const email = (row['Email'] || '').trim();
  const company = (row['Company Name'] || '').trim();
  const city = (row['City'] || '').trim();
  const state = (row['State'] || '').trim();
  const country = (row['Country'] || '').trim() || 'USA';

  const body = {
    city,
    company,
    country,
    state,
    email,
    first_name: firstName,
    last_name: lastName,
    list: listName,
    // Let SmartReach infer timezone if possible
    custom_fields: {}
  };

  const endpoint = new URL(`/api/v1/prospects?team_id=${encodeURIComponent(teamId)}`, baseUrl).toString();

  console.log('Posting test prospect to SmartReach list:', listName);
  console.log('Prospect:', {
    first_name: body.first_name,
    last_name: body.last_name,
    email: body.email,
    company: body.company,
    city: body.city,
    state: body.state,
    country: body.country
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
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
  console.error('Error calling SmartReach API', err);
  process.exit(1);
});
