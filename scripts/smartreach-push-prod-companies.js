#!/usr/bin/env node

// Push all MV-ok, non–catch-all production/post company contacts into the
// "Production Companies" SmartReach list via API (v1), including linkedin_url.
// SmartReach will upsert by email; some duplicates are possible and acceptable.

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const INPUT_PATH = path.join(LEADS_DIR, 'apollo-prod-contacts-verified-all.csv');

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

function isUS(rec) {
  const country = (rec['Country'] || '').toLowerCase();
  const companyCountry = (rec['Company Country'] || '').toLowerCase();
  const addr = (rec['Company Address'] || '').toLowerCase();

  if (country.includes('united states') || country === 'us' || country === 'usa') return true;
  if (companyCountry.includes('united states') || companyCountry === 'us' || companyCountry === 'usa') return true;
  if (addr.includes('united states')) return true;
  return false;
}

function isNonCatchOkProd(rec) {
  if (!isUS(rec)) return false;

  const mvResult = (rec.mv_result || '').toLowerCase();
  const mvSub = (rec.mv_subresult || '').toLowerCase();
  const ca = (rec['Primary Email Catch-all Status'] || '').toLowerCase();
  const email = (rec['Email'] || '').trim();

  if (!email) return false;
  if (mvResult !== 'ok') return false;
  if (ca && ca.includes('catch-all')) return false;
  if (mvSub && mvSub.includes('catchall')) return false;

  return true;
}

const candidates = rows.filter(isNonCatchOkProd);

if (candidates.length === 0) {
  console.error('No suitable production contacts found to push to SmartReach');
  process.exit(1);
}

async function pushAll() {
  const env = loadEnv();
  const apiKey = env.SMARTREACH_API_KEY;
  const baseUrl = env.SMARTREACH_API_BASE || 'https://api.smartreach.io';
  const listName = env.SMARTREACH_PROD_LIST || 'Production Companies';
  const teamId = env.SMARTREACH_TEAM_ID;

  if (!apiKey) {
    console.error('SMARTREACH_API_KEY is not set in .env.local');
    process.exit(1);
  }

  if (!teamId) {
    console.error('SMARTREACH_TEAM_ID is not set in .env.local');
    process.exit(1);
  }

  // v1 endpoint (team_id is required as query param)
  const endpointUrl = new URL('/api/v1/prospects', baseUrl);
  endpointUrl.searchParams.set('team_id', teamId);
  const endpointBase = endpointUrl.toString();

  let sent = 0;
  let errors = 0;

  for (const rec of candidates) {
    const email = (rec['Email'] || '').trim();
    if (!email) continue;

    const firstName = (rec['First Name'] || '').trim();
    const lastName = (rec['Last Name'] || '').trim();
    const company = (rec['Company Name'] || '').trim();
    const city = (rec['City'] || '').trim();
    const state = (rec['State'] || '').trim();
    const country = (rec['Country'] || '').trim() || 'USA';
    const title = (rec['Title'] || '').trim();
    const linkedin = (
      rec['Person Linkedin Url'] ||
      rec['Person Linkedin URL'] ||
      rec['Person Linkedin'] ||
      rec['Linkedin'] ||
      ''
    ).trim();

    const body = {
      city,
      company,
      country,
      state,
      email,
      first_name: firstName,
      last_name: lastName,
      list: listName,
      job_title: title,
      linkedin_url: linkedin || undefined,
      custom_fields: {}
    };

    try {
      const res = await fetch(endpointBase, {
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

      if (!res.ok || data.status === 'error') {
        errors++;
        console.error('Error adding prod prospect', email, 'status', res.status, 'body', data);
      } else {
        sent++;
        console.log('Upserted prod prospect', email, '-> id', data?.data?.prospect?.id);
      }
    } catch (err) {
      errors++;
      console.error('Network error adding prod prospect', email, err);
    }
  }

  console.log('Done v1 upload of production companies. Upserted:', sent, 'Errors:', errors);
}

pushAll().catch((err) => {
  console.error('Fatal error pushing production prospects to SmartReach', err);
  process.exit(1);
});
