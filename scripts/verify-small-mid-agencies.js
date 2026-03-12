#!/usr/bin/env node

// MillionVerifier step for Scout Apollo pipeline — small/mid agencies

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const INPUT_PATH = path.join(ROOT_DIR, 'leads', 'select-small-mid-agencies-us.csv');
const VERIFIED_PATH = path.join(ROOT_DIR, 'leads', 'select-small-mid-agencies-us-verified.csv');
const SMARTREACH_PATH = path.join(ROOT_DIR, 'leads', 'select-small-mid-agencies-us-smartreach.csv');

const CONCURRENCY = 5;
const BATCH_DELAY_MS = 200;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

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

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
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
      const isLastAttempt = attempt === RETRY_ATTEMPTS;
      if (isLastAttempt) {
        console.warn(`  [warn] MV API error for ${email}: ${err.message}`);
        return { result: 'error', quality: '', subresult: 'network_error' };
      }
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  return { result: 'error', quality: '', subresult: 'network_error' };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function readCsvIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function buildVerifiedLookup(records) {
  const lookup = new Map();
  for (const rec of records) {
    const email = normalizeEmail(rec.contact_email);
    if (!email && (!rec.mv_result || rec.mv_result.trim() === '')) continue;
    lookup.set(email, {
      mv_result: rec.mv_result || '',
      mv_quality: rec.mv_quality || '',
      mv_subresult: rec.mv_subresult || ''
    });
  }
  return lookup;
}

function applyVerificationResult(rec, verification) {
  rec.mv_result = verification.mv_result || '';
  rec.mv_quality = verification.mv_quality || '';
  rec.mv_subresult = verification.mv_subresult || '';
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

async function main() {
  const env = loadEnv();
  const apiKey = env.MV_API_KEY;
  const baseUrl = env.MV_API_URL || 'https://api.millionverifier.com/api';

  if (!apiKey) {
    console.error('MV_API_KEY is not set in .env.local');
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_PATH)) {
    console.error('Input CSV not found:', INPUT_PATH);
    process.exit(1);
  }

  const records = readCsvIfPresent(INPUT_PATH);
  const existingVerified = readCsvIfPresent(VERIFIED_PATH);
  const verifiedLookup = buildVerifiedLookup(existingVerified);

  const mvConfig = { apiKey, baseUrl };

  let alreadyVerified = 0;
  let newlyVerified = 0;
  const toVerifyByEmail = new Map();

  for (const rec of records) {
    const email = normalizeEmail(rec.contact_email);
    const cached = verifiedLookup.get(email);
    if (cached) {
      applyVerificationResult(rec, cached);
      alreadyVerified++;
      continue;
    }

    if (!email) {
      toVerifyByEmail.set(`__blank__:${toVerifyByEmail.size}`, [rec]);
      continue;
    }

    const existing = toVerifyByEmail.get(email);
    if (existing) {
      existing.push(rec);
    } else {
      toVerifyByEmail.set(email, [rec]);
    }
  }

  const toVerify = Array.from(toVerifyByEmail.entries());
  const rowsToVerify = toVerify.reduce((sum, [, group]) => sum + group.length, 0);

  console.log(`Loaded ${records.length} rows. Already verified: ${alreadyVerified}. To verify: ${rowsToVerify}`);

  // Process in batches of CONCURRENCY
  for (let i = 0; i < toVerify.length; i += CONCURRENCY) {
    const batch = toVerify.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async ([email, group]) => {
        let verification;
        if (email.startsWith('__blank__:')) {
          verification = { mv_result: 'no_email', mv_quality: '', mv_subresult: '' };
        } else {
          const { result, quality, subresult } = await verifyEmail(mvConfig, email);
          verification = { mv_result: result, mv_quality: quality, mv_subresult: subresult };
        }
        for (const rec of group) {
          applyVerificationResult(rec, verification);
          newlyVerified++;
        }
        verifiedLookup.set(email.startsWith('__blank__:') ? '' : email, verification);
      })
    );

    const processedGroups = Math.min(i + CONCURRENCY, toVerify.length);
    const processedRows = toVerify
      .slice(0, processedGroups)
      .reduce((sum, [, group]) => sum + group.length, 0);
    console.log(`  Verified ${processedRows}/${rowsToVerify} new rows...`);

    if (i + CONCURRENCY < toVerify.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Write all rows (with MV data) to verified CSV
  const allColumns = ['name', 'company', 'city', 'type', 'source', 'website', 'contact_name', 'contact_email', 'linkedin_url', 'notes', 'mv_result', 'mv_quality', 'mv_subresult'];
  const verifiedCsv = stringify(records, { header: true, columns: allColumns });
  fs.writeFileSync(VERIFIED_PATH, verifiedCsv, 'utf8');
  console.log(`Wrote verified file: ${VERIFIED_PATH}`);

  // Build SmartReach export: mv_result === "ok", exclude catchall subresults
  const smartReachRows = records
    .filter((rec) => rec.mv_result === 'ok' && !(rec.mv_subresult || '').toLowerCase().includes('catchall'))
    .map(buildSmartReachRow);

  const smartReachColumns = ['first_name', 'last_name', 'email', 'company_name', 'website', 'city', 'title'];
  const smartReachCsv = stringify(smartReachRows, { header: true, columns: smartReachColumns });
  fs.writeFileSync(SMARTREACH_PATH, smartReachCsv, 'utf8');
  console.log(`Wrote SmartReach file: ${SMARTREACH_PATH}`);

  const okCount = records.filter((r) => r.mv_result === 'ok').length;

  console.log('\n--- Summary ---');
  console.log(`Total rows:             ${records.length}`);
  console.log(`Already verified:       ${alreadyVerified}`);
  console.log(`Newly verified:         ${newlyVerified}`);
  console.log(`Valid/ok count:         ${okCount}`);
  console.log(`SmartReach export rows: ${smartReachRows.length}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
