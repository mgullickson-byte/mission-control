#!/usr/bin/env node

// Verify Apollo contacts with MillionVerifier and tag basic segments

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

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

function classifySegment(record) {
  const industry = (record['Industry'] || '').toLowerCase();
  const company = (record['Company Name'] || '').toLowerCase();
  const title = (record['Title'] || '').toLowerCase();
  const country = (record['Country'] || record['Company Country'] || '').toLowerCase();

  // Healthcare / issue-focused agencies
  if (
    industry.includes('health care') ||
    industry.includes('hospital & health care') ||
    industry.includes('health, wellness & fitness') ||
    company.includes('21grams') ||
    company.includes('gmmb') ||
    company.includes('jacques')
  ) {
    return 'health_agency';
  }

  // Core marketing / advertising agencies
  if (
    industry.includes('marketing & advertising') ||
    industry.includes('public relations & communications')
  ) {
    return 'agency';
  }

  // Production / post / editorial shops
  if (
    industry.includes('media production') ||
    industry.includes('motion pictures & film') ||
    industry.includes('post production') ||
    industry.includes('postproduction') ||
    company.includes('studio') ||
    company.includes('studios') ||
    company.includes('filmworks') ||
    company.includes('pictures') ||
    company.includes('post') ||
    company.includes('edit') ||
    company.includes('media')
  ) {
    return 'production_post';
  }

  // Online / broadcast / hybrid media
  if (
    industry.includes('online media') ||
    industry.includes('broadcast media')
  ) {
    return 'media_hybrid';
  }

  // International catch-all (if not already classified)
  if (country && !country.includes('united states')) {
    return 'international_other';
  }

  return 'other';
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

  const inputPath = process.argv[2] || path.join(ROOT_DIR, 'leads', 'apollo-contacts-export_3.csv');
  if (!fs.existsSync(inputPath)) {
    console.error('Input CSV not found at', inputPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true
  });

  const mvConfig = { apiKey, baseUrl };
  const cache = new Map();

  for (const rec of records) {
    rec.segment = classifySegment(rec);
  }

  console.log(`Loaded ${records.length} records from ${inputPath}`);

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

  const outputDir = path.dirname(inputPath);
  const allOutPath = path.join(outputDir, 'apollo-contacts-verified-all.csv');
  const invalidLinkedInPath = path.join(outputDir, 'apollo-invalid-with-linkedin.csv');

  const allColumnsSet = new Set();
  for (const rec of records) {
    Object.keys(rec).forEach((k) => allColumnsSet.add(k));
  }
  allColumnsSet.add('segment');
  allColumnsSet.add('mv_result');
  allColumnsSet.add('mv_quality');
  allColumnsSet.add('mv_subresult');

  const allColumns = Array.from(allColumnsSet);

  const allCsv = stringify(records, {
    header: true,
    columns: allColumns
  });
  fs.writeFileSync(allOutPath, allCsv, 'utf8');
  console.log('Wrote full verified file to', allOutPath);

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
      `Wrote ${invalidWithLinkedIn.length} invalid contacts with LinkedIn to`,
      invalidLinkedInPath
    );
  } else {
    console.log('No invalid contacts with LinkedIn URL found.');
  }
}

main().catch((err) => {
  console.error('Error verifying Apollo contacts', err);
  process.exit(1);
});
