#!/usr/bin/env node

// Build a CSV for SmartReach import to backfill LinkedIn URLs
// for MV-ok, non–catch-all ad-agency producers that are already
// in SmartReach. Keyed by Email so SmartReach can merge/update.

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const INPUT_PATH = path.join(LEADS_DIR, 'apollo-contacts-verified-all.csv');

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
  const email = (row['Email'] || '').trim();
  if (!email) return false;
  if (mvResult !== 'ok') return false;
  if (ca && ca.includes('catch-all')) return false;
  if (mvSub && mvSub.includes('catchall')) return false;
  return true;
}

const candidates = rows.filter(isNonCatchOkAgency);

if (candidates.length === 0) {
  console.error('No suitable agency contacts found');
  process.exit(1);
}

const outRows = candidates.map((row) => {
  const email = (row['Email'] || '').trim();
  const firstName = (row['First Name'] || '').trim();
  const lastName = (row['Last Name'] || '').trim();
  const company = (row['Company Name'] || '').trim();
  const linkedin = (row['Person Linkedin Url'] || '').trim();
  const title = (row['Title'] || '').trim();

  return {
    Email: email,
    FirstName: firstName,
    LastName: lastName,
    Company: company,
    Title: title,
    LinkedIn: linkedin
  };
});

const csv = stringify(outRows, { header: true });
const OUT_PATH = path.join(LEADS_DIR, 'small-mid-agencies-linkedin-merge.csv');
fs.writeFileSync(OUT_PATH, csv, 'utf8');
console.log('Wrote SmartReach LinkedIn-merge CSV to', OUT_PATH);
console.log('Rows:', outRows.length);
