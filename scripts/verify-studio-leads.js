#!/usr/bin/env node

// MillionVerifier step for Studio Awesome Echo pipeline.
// Verifies emails in studio-agencies.csv and studio-brands.csv,
// writes verified output files, and exports SmartReach-ready leads.

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const LEADS_DIR = path.join(ROOT_DIR, 'leads');

const AGENCIES_INPUT = path.join(LEADS_DIR, 'studio-agencies.csv');
const BRANDS_INPUT = path.join(LEADS_DIR, 'studio-brands.csv');
const AGENCIES_VERIFIED = path.join(LEADS_DIR, 'studio-agencies-verified.csv');
const BRANDS_VERIFIED = path.join(LEADS_DIR, 'studio-brands-verified.csv');
const SMARTREACH_PATH = path.join(LEADS_DIR, 'studio-smartreach.csv');

const CONCURRENCY = 5;
const BATCH_DELAY_MS = 200;
const ALL_COLUMNS = ['name', 'company', 'city', 'type', 'source', 'website', 'contact_name', 'contact_email', 'notes', 'mv_result', 'mv_quality', 'mv_subresult'];
const SMARTREACH_COLUMNS = ['first_name', 'last_name', 'email', 'company_name', 'website', 'city', 'title'];

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyEmail(mvConfig, email) {
  const { apiKey, baseUrl } = mvConfig;
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const url = new URL('v3/', base);
  url.searchParams.set('api', apiKey);
  url.searchParams.set('email', email);
  url.searchParams.set('timeout', '10');

  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    let data;
    try {
      data = await res.json();
    } catch {
      return { result: 'error', quality: '', subresult: 'parse_error' };
    }
    return {
      result: data.result || 'error',
      quality: String(data.quality ?? ''),
      subresult: data.subresult || ''
    };
  } catch (err) {
    console.warn(`  [warn] MV API error for ${email}: ${err.message}`);
    return { result: 'error', quality: '', subresult: 'network_error' };
  }
}

function buildSmartReachRow(rec) {
  const parts = (rec.contact_name || '').trim().split(/\s+/);
  const first_name = parts[0] || '';
  const last_name = parts.slice(1).join(' ') || '';
  return {
    first_name,
    last_name,
    email: rec.contact_email,
    company_name: rec.company,
    website: rec.website,
    city: rec.city,
    title: rec.notes
  };
}

async function verifyRecords(records, label, mvConfig) {
  let alreadyVerified = 0;

  const toVerify = records.filter((rec) => {
    if (!rec.contact_email || !rec.contact_email.trim()) return false;
    if (rec.mv_result && rec.mv_result.trim() !== '') {
      alreadyVerified++;
      return false;
    }
    return true;
  });

  console.log(`[${label}] Loaded ${records.length} rows. Already verified: ${alreadyVerified}. To verify: ${toVerify.length}`);

  for (let i = 0; i < toVerify.length; i += CONCURRENCY) {
    const batch = toVerify.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (rec) => {
        const { result, quality, subresult } = await verifyEmail(mvConfig, rec.contact_email.trim());
        rec.mv_result = result;
        rec.mv_quality = quality;
        rec.mv_subresult = subresult;
      })
    );

    console.log(`  [${label}] Verified ${Math.min(i + CONCURRENCY, toVerify.length)}/${toVerify.length}...`);

    if (i + CONCURRENCY < toVerify.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return toVerify.length;
}

function loadCsv(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[warn] ${label} CSV not found: ${filePath} — skipping`);
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true });
}

async function main() {
  const env = loadEnv();
  const apiKey = env.MV_API_KEY;
  const baseUrl = env.MV_API_URL || 'https://api.millionverifier.com/api';

  if (!apiKey) {
    console.error('MV_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const mvConfig = { apiKey, baseUrl };

  const agencyRecords = loadCsv(AGENCIES_INPUT, 'studio-agencies');
  const brandRecords = loadCsv(BRANDS_INPUT, 'studio-brands');

  const agenciesNewlyVerified = await verifyRecords(agencyRecords, 'agencies', mvConfig);
  const brandsNewlyVerified = await verifyRecords(brandRecords, 'brands', mvConfig);

  // Write verified files
  fs.writeFileSync(AGENCIES_VERIFIED, stringify(agencyRecords, { header: true, columns: ALL_COLUMNS }), 'utf8');
  console.log(`Wrote verified file: ${AGENCIES_VERIFIED}`);

  fs.writeFileSync(BRANDS_VERIFIED, stringify(brandRecords, { header: true, columns: ALL_COLUMNS }), 'utf8');
  console.log(`Wrote verified file: ${BRANDS_VERIFIED}`);

  // Build combined SmartReach export: mv_result === "ok" AND mv_quality !== "risky"
  const isSmartReachReady = (rec) =>
    rec.mv_result === 'ok' && (rec.mv_quality || '').toLowerCase() !== 'risky';

  const smartReachRows = [
    ...agencyRecords.filter(isSmartReachReady),
    ...brandRecords.filter(isSmartReachReady)
  ].map(buildSmartReachRow);

  fs.writeFileSync(
    SMARTREACH_PATH,
    stringify(smartReachRows, { header: true, columns: SMARTREACH_COLUMNS }),
    'utf8'
  );
  console.log(`Wrote SmartReach file: ${SMARTREACH_PATH}`);

  console.log('\n--- Summary ---');
  console.log(`Agencies verified:       ${agenciesNewlyVerified} new  (${agencyRecords.length} total rows)`);
  console.log(`Brands verified:         ${brandsNewlyVerified} new  (${brandRecords.length} total rows)`);
  console.log(`SmartReach-ready leads:  ${smartReachRows.length} exported`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
