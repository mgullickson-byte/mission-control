#!/usr/bin/env node

// Verify Apollo production-company contacts with MillionVerifier
// and write a dedicated verified CSV.

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const INPUT_PATH = path.join(ROOT_DIR, 'leads', 'apollo-contacts-export_4.csv');

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

async function verifyEmail(mvConfig, email, cache) {
  if (!email) return { result: 'no_email', quality: '', subresult: '' };

  const key = email.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const { apiKey, baseUrl } = mvConfig;
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const url = new URL('v3/', base);
  url.searchParams.set('api', apiKey);
  url.searchParams.set('email', email);
  url.searchParams.set('timeout', '10');

  const res = await fetch(url.toString(), { method: 'GET' });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { result: 'error', quality: '', subresult: 'parse_error' };
  }

  const out = {
    result: data.result || 'error',
    quality: data.quality || '',
    subresult: data.subresult || ''
  };
  cache.set(key, out);
  return out;
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
    console.error('Input CSV not found at', INPUT_PATH);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true
  });

  console.log(`Loaded ${records.length} production contacts from ${INPUT_PATH}`);

  const mvConfig = { apiKey, baseUrl };
  const cache = new Map();

  const concurrency = 10;
  let processed = 0;

  async function processBatch(startIndex) {
    const batch = records.slice(startIndex, startIndex + concurrency);
    if (batch.length === 0) return;

    await Promise.all(
      batch.map(async (rec) => {
        const email = rec['Email'] || rec['Email '];
        const { result, quality, subresult } = await verifyEmail(mvConfig, email, cache);
        rec.mv_result = result;
        rec.mv_quality = quality;
        rec.mv_subresult = subresult;
        processed += 1;
      })
    );

    console.log(`Verified ${processed}/${records.length} contacts...`);

    if (startIndex + concurrency < records.length) {
      await processBatch(startIndex + concurrency);
    }
  }

  await processBatch(0);

  const outputDir = path.dirname(INPUT_PATH);
  const allOutPath = path.join(outputDir, 'apollo-prod-contacts-verified-all.csv');
  const invalidLinkedInPath = path.join(outputDir, 'apollo-prod-invalid-with-linkedin.csv');

  const allColumnsSet = new Set();
  for (const rec of records) {
    Object.keys(rec).forEach((k) => allColumnsSet.add(k));
  }
  allColumnsSet.add('mv_result');
  allColumnsSet.add('mv_quality');
  allColumnsSet.add('mv_subresult');

  const allColumns = Array.from(allColumnsSet);

  const allCsv = stringify(records, {
    header: true,
    columns: allColumns
  });
  fs.writeFileSync(allOutPath, allCsv, 'utf8');
  console.log('Wrote full verified production file to', allOutPath);

  const invalidWithLinkedIn = records.filter(
    (rec) =>
      rec.mv_result === 'invalid' &&
      (rec['Person Linkedin Url'] || rec['Person Linkedin URL'] || rec['Person Linkedin'])
  );

  if (invalidWithLinkedIn.length > 0) {
    const invalidCsv = stringify(invalidWithLinkedIn, {
      header: true,
      columns: allColumns
    });
    fs.writeFileSync(invalidLinkedInPath, invalidCsv, 'utf8');
    console.log(
      `Wrote ${invalidWithLinkedIn.length} invalid production contacts with LinkedIn to`,
      invalidLinkedInPath
    );
  } else {
    console.log('No invalid production contacts with LinkedIn URL found.');
  }
}

main().catch((err) => {
  console.error('Error verifying Apollo production contacts', err);
  process.exit(1);
});
