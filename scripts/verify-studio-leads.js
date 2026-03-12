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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function writeCsv(filePath, records, columns) {
  fs.writeFileSync(filePath, stringify(records, { header: true, columns }), 'utf8');
}

async function verifyEmail(mvConfig, email) {
  const { apiKey, baseUrl } = mvConfig;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL('v3/', base);
  url.searchParams.set('api', apiKey);
  url.searchParams.set('email', email);
  url.searchParams.set('timeout', '10');

  try {
    const res = await fetch(url.toString(), { method: 'GET' });
    const text = await res.text();
    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      if (!res.ok) {
        console.warn(`  [warn] MV API HTTP ${res.status} for ${email}`);
        return { result: 'error', quality: '', subresult: `http_${res.status}` };
      }
      console.warn(`  [warn] MV response parse error for ${email}`);
      return { result: 'error', quality: '', subresult: 'parse_error' };
    }

    if (!res.ok) {
      const errorCode = data?.subresult || data?.error_code || data?.code || `http_${res.status}`;
      console.warn(`  [warn] MV API HTTP ${res.status} for ${email}: ${errorCode}`);
      return { result: 'error', quality: '', subresult: String(errorCode) };
    }

    return {
      result: data?.result || 'error',
      quality: String(data?.quality ?? ''),
      subresult: data?.subresult || ''
    };
  } catch (err) {
    console.warn(`  [warn] MV API network error for ${email}: ${err.message}`);
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

function loadCsv(filePath, label, options = {}) {
  const { warnIfMissing = true } = options;
  if (!fs.existsSync(filePath)) {
    if (warnIfMissing) {
      console.warn(`[warn] ${label} CSV not found: ${filePath} — skipping`);
    }
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function buildVerifiedIndex(records) {
  const index = new Map();
  for (const rec of records) {
    const email = normalizeEmail(rec.contact_email);
    if (!email) continue;
    const result = String(rec.mv_result || '').trim();
    if (!result) continue;
    index.set(email, {
      mv_result: result,
      mv_quality: String(rec.mv_quality || ''),
      mv_subresult: String(rec.mv_subresult || '')
    });
  }
  return index;
}

function mergeExistingVerification(records, verifiedIndex) {
  let alreadyVerified = 0;

  for (const rec of records) {
    const email = normalizeEmail(rec.contact_email);
    if (!email) continue;
    const existing = verifiedIndex.get(email);
    if (!existing) continue;
    rec.mv_result = existing.mv_result;
    rec.mv_quality = existing.mv_quality;
    rec.mv_subresult = existing.mv_subresult;
    alreadyVerified++;
  }

  return alreadyVerified;
}

async function verifyRecords(records, label, mvConfig, outputPath, stats) {
  const groupedByEmail = new Map();

  for (const rec of records) {
    const email = normalizeEmail(rec.contact_email);
    if (!email) continue;
    if (String(rec.mv_result || '').trim()) continue;
    if (!groupedByEmail.has(email)) groupedByEmail.set(email, []);
    groupedByEmail.get(email).push(rec);
  }

  const emailsToVerify = Array.from(groupedByEmail.keys());
  let newlyVerifiedRows = 0;

  console.log(`[${label}] Total rows: ${stats.totalRows}. Already verified: ${stats.alreadyVerifiedRows}. Newly verifying: ${stats.pendingRows} rows across ${stats.pendingEmails} emails.`);

  for (let i = 0; i < emailsToVerify.length; i += CONCURRENCY) {
    const batch = emailsToVerify.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (email) => {
        const verification = await verifyEmail(mvConfig, email);
        const matchingRows = groupedByEmail.get(email) || [];
        for (const rec of matchingRows) {
          rec.mv_result = verification.result;
          rec.mv_quality = verification.quality;
          rec.mv_subresult = verification.subresult;
          newlyVerifiedRows++;
        }
      })
    );

    writeCsv(outputPath, records, ALL_COLUMNS);
    console.log(`  [${label}] Verified ${Math.min(i + CONCURRENCY, emailsToVerify.length)}/${emailsToVerify.length} emails...`);

    if (i + CONCURRENCY < emailsToVerify.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return {
    newlyVerifiedRows,
    newlyVerifiedEmails: emailsToVerify.length
  };
}

function buildDataset(inputPath, verifiedPath, label) {
  const inputRecords = loadCsv(inputPath, label);
  const verifiedRecords = loadCsv(verifiedPath, `${label} verified`, { warnIfMissing: false });
  const verifiedIndex = buildVerifiedIndex(verifiedRecords);
  const alreadyVerified = mergeExistingVerification(inputRecords, verifiedIndex);
  let pendingRows = 0;
  const pendingEmails = new Set();

  for (const rec of inputRecords) {
    const email = normalizeEmail(rec.contact_email);
    if (!email || String(rec.mv_result || '').trim()) continue;
    pendingRows++;
    pendingEmails.add(email);
  }

  return {
    records: inputRecords,
    stats: {
      totalRows: inputRecords.length,
      alreadyVerifiedRows: alreadyVerified,
      pendingRows,
      pendingEmails: pendingEmails.size
    }
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

  const mvConfig = { apiKey, baseUrl };

  const agencies = buildDataset(AGENCIES_INPUT, AGENCIES_VERIFIED, 'studio-agencies');
  const brands = buildDataset(BRANDS_INPUT, BRANDS_VERIFIED, 'studio-brands');

  const agencyVerifyStats = await verifyRecords(agencies.records, 'agencies', mvConfig, AGENCIES_VERIFIED, agencies.stats);
  const brandVerifyStats = await verifyRecords(brands.records, 'brands', mvConfig, BRANDS_VERIFIED, brands.stats);

  writeCsv(AGENCIES_VERIFIED, agencies.records, ALL_COLUMNS);
  console.log(`Wrote verified file: ${AGENCIES_VERIFIED}`);

  writeCsv(BRANDS_VERIFIED, brands.records, ALL_COLUMNS);
  console.log(`Wrote verified file: ${BRANDS_VERIFIED}`);

  const isSmartReachReady = (rec) =>
    rec.mv_result === 'ok' && !(rec.mv_subresult || '').toLowerCase().includes('catchall');

  const smartReachRows = [
    ...agencies.records.filter(isSmartReachReady),
    ...brands.records.filter(isSmartReachReady)
  ].map(buildSmartReachRow);

  writeCsv(SMARTREACH_PATH, smartReachRows, SMARTREACH_COLUMNS);
  console.log(`Wrote SmartReach file: ${SMARTREACH_PATH}`);

  console.log('\n--- Summary ---');
  console.log(`Agencies total rows:      ${agencies.stats.totalRows}`);
  console.log(`Agencies already verified:${String(agencies.stats.alreadyVerifiedRows).padStart(4, ' ')}`);
  console.log(`Agencies newly verified:  ${agencyVerifyStats.newlyVerifiedRows} rows (${agencyVerifyStats.newlyVerifiedEmails} emails)`);
  console.log(`Brands total rows:        ${brands.stats.totalRows}`);
  console.log(`Brands already verified:  ${brands.stats.alreadyVerifiedRows}`);
  console.log(`Brands newly verified:    ${brandVerifyStats.newlyVerifiedRows} rows (${brandVerifyStats.newlyVerifiedEmails} emails)`);
  console.log(`SmartReach-ready leads:   ${smartReachRows.length} exported`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
