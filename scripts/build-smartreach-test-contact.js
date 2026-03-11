#!/usr/bin/env node

// Build a single-contact SmartReach CSV from the ultra-safe agency segment

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
  const email = row['Email'] || '';
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

// Pick the first one for the test
const row = candidates[0];

const name = `${row['First Name'] || ''} ${row['Last Name'] || ''}`.trim();
const [firstName, ...rest] = name.split(' ');
const lastName = rest.join(' ');

const mapped = [{
  FirstName: firstName || '',
  LastName: lastName || '',
  Email: row['Email'] || '',
  Company: row['Company Name'] || '',
  Title: row['Title'] || '',
  City: row['City'] || '',
  Segment: 'Ad Agencies – Apollo Producers (US, MV ok, non–catch-all)',
  Source: 'Mission Control',
  Website: row['Website'] || '',
  LinkedIn: row['Person Linkedin Url'] || '',
  Notes: 'Test contact from Apollo agencies MV-ok non–catch-all segment'
}];

const csv = stringify(mapped, { header: true });
const OUT_PATH = path.join(LEADS_DIR, 'small-mid-agencies-smartreach-test.csv');
fs.writeFileSync(OUT_PATH, csv, 'utf8');
console.log('Wrote SmartReach test CSV to', OUT_PATH);
console.log('Contact:', mapped[0]);
