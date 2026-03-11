#!/usr/bin/env node

// Build Mission Control leads CSV for production/post companies
// from apollo-prod-contacts-verified-all.csv

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const INPUT_PATH = path.join(LEADS_DIR, 'apollo-prod-contacts-verified-all.csv');

if (!fs.existsSync(INPUT_PATH)) {
  console.error('Verified production CSV not found at', INPUT_PATH);
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
  const email = (rec['Email'] || '').trim();

  if (!email) return false;
  if (mvResult !== 'ok') return false;
  if (catchAllStatus && catchAllStatus.includes('catch-all')) return false;
  if (mvSub && mvSub.includes('catchall')) return false;

  return true;
}

const leads = [];

for (const row of records) {
  if (!isUS(row)) continue;
  if (!isValidNonCatchAll(row)) continue;

  const company = String(row['Company Name'] || '').trim();
  const city = String(row['City'] || '').trim();
  const state = String(row['State'] || '').trim();
  const cityState = [city, state].filter(Boolean).join(', ');
  const website = String(row['Website'] || '').trim();
  const firstName = String(row['First Name'] || '').trim();
  const lastName = String(row['Last Name'] || '').trim();
  const contactName = [firstName, lastName].filter(Boolean).join(' ');
  const contactEmail = String(row['Email'] || '').trim();
  const title = String(row['Title'] || '').trim();
  const linkedin = String(
    row['Person Linkedin Url'] ||
      row['Person Linkedin URL'] ||
      row['Person Linkedin'] ||
      row['Linkedin'] ||
      ''
  ).trim();

  leads.push({
    name: company,
    company,
    city: cityState || city,
    type: 'Prod',
    source: 'Apollo – Prod companies (NY/Chicago/LA, MV ok, non–catch-all)',
    website,
    contact_name: contactName,
    contact_email: contactEmail,
    linkedin_url: linkedin,
    notes: title
  });
}

const outPath = path.join(LEADS_DIR, 'apollo-prod-us-leads.csv');
const columns = [
  'name',
  'company',
  'city',
  'type',
  'source',
  'website',
  'contact_name',
  'contact_email',
  'linkedin_url',
  'notes'
];
const csv = stringify(leads, { header: true, columns });
fs.writeFileSync(outPath, csv, 'utf8');
console.log('Wrote production leads CSV to', outPath, 'rows:', leads.length);
