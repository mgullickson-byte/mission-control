#!/usr/bin/env node

// Take apollo-contacts-verified-all.csv and emit SmartReach-ready segment CSVs
// Filters applied:
// - US-only (or companies with US locations in address/company country)
// - mv_result === 'ok' (MillionVerifier deliverable)
// - Exclude catch-all domains (Apollo catch-all status or MV catch-all subresult)

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const INPUT_PATH = path.join(ROOT_DIR, 'leads', 'apollo-contacts-verified-all.csv');

if (!fs.existsSync(INPUT_PATH)) {
  console.error('Input verified CSV not found at', INPUT_PATH);
  process.exit(1);
}

const raw = fs.readFileSync(INPUT_PATH, 'utf8');
const records = parse(raw, { columns: true, skip_empty_lines: true });

function isUS(rec) {
  const country = (rec['Country'] || '').toLowerCase();
  const companyCountry = (rec['Company Country'] || '').toLowerCase();
  const addr = (rec['Company Address'] || '').toLowerCase();

  if (country.includes('united states') || country === 'us' || country === 'usa') return true;
  if (companyCountry.includes('united states') || companyCountry === 'us' || companyCountry === 'usa') return true;
  if (addr.includes('united states')) return true;
  return false;
}

function isValidNonCatchAll(rec) {
  const mvResult = (rec.mv_result || '').toLowerCase();
  const mvSub = (rec.mv_subresult || '').toLowerCase();
  const catchAllStatus = (rec['Primary Email Catch-all Status'] || '').toLowerCase();
  const email = rec['Email'] || rec['Email '];

  if (!email) return false;
  if (mvResult !== 'ok') return false; // MillionVerifier uses 'ok' for valid

  // Exclude known catch-alls from Apollo or MV
  if (catchAllStatus && catchAllStatus.includes('catch-all')) return false;
  if (mvSub && mvSub.includes('catchall')) return false;

  return true;
}

const segments = {
  agency: [],
  production_post: [],
  health_agency: [],
  media_hybrid: [],
  other: []
};

for (const rec of records) {
  const seg = rec.segment || 'other';
  if (!isUS(rec)) continue;
  if (!isValidNonCatchAll(rec)) continue;

  if (segments[seg]) {
    segments[seg].push(rec);
  } else {
    segments.other.push(rec);
  }
}

const outputDir = path.join(ROOT_DIR, 'leads');

function writeSegment(name, rows, filename) {
  if (!rows.length) {
    console.log(`Segment ${name}: 0 rows (nothing written)`);
    return;
  }
  const columns = Object.keys(rows[0]);
  const csv = stringify(rows, { header: true, columns });
  const outPath = path.join(outputDir, filename);
  fs.writeFileSync(outPath, csv, 'utf8');
  console.log(`Segment ${name}: wrote ${rows.length} rows to ${outPath}`);
}

writeSegment('agency', segments.agency, 'apollo-select-agencies-us-valid.csv');
writeSegment('production_post', segments.production_post, 'apollo-production-post-us-valid.csv');
writeSegment('health_agency', segments.health_agency, 'apollo-health-agencies-us-valid.csv');
writeSegment('media_hybrid', segments.media_hybrid, 'apollo-media-hybrid-us-valid.csv');
writeSegment('other', segments.other, 'apollo-other-us-valid.csv');
