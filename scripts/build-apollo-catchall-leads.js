#!/usr/bin/env node

// Build "parking lot" leads CSVs for catch-all domains from Apollo-verified data
// Input: leads/apollo-contacts-verified-all.csv
// Output:
//   leads/apollo-agencies-us-catchall-leads.csv
//   leads/apollo-prodpost-us-catchall-leads.csv

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

function isCatchAll(row) {
  const mvResult = (row.mv_result || '').toLowerCase();
  const mvSub = (row.mv_subresult || '').toLowerCase();
  const ca = (row['Primary Email Catch-all Status'] || '').toLowerCase();

  if (mvResult === 'catch_all') return true;
  if (ca && ca.includes('catch-all')) return true;
  if (mvSub && mvSub.includes('catchall')) return true;
  return false;
}

function toLead(row, type, sourceLabel) {
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

  return {
    name: company,
    company,
    city: cityState || city,
    type,
    source: sourceLabel,
    website,
    contact_name: contactName,
    contact_email: contactEmail,
    notes: title
  };
}

const agencyLeads = [];
const prodpostLeads = [];

for (const row of rows) {
  const seg = row.segment || '';
  const mvResult = (row.mv_result || '').toLowerCase();
  const email = row['Email'] || '';
  if (!email) continue;

  // We only park catch-alls that are not explicitly invalid.
  if (!isCatchAll(row)) continue;
  if (mvResult === 'invalid') continue;

  if (seg === 'agency') {
    agencyLeads.push(
      toLead(row, 'Agency', 'Apollo – Agency producers (US, catch-all domain)')
    );
  } else if (seg === 'production_post') {
    prodpostLeads.push(
      toLead(row, 'Prod', 'Apollo – Production/Post EPs (US, catch-all domain)')
    );
  }
}

function writeLeadsCsv(filename, rowsOut) {
  if (!rowsOut.length) {
    console.log(`No rows for ${filename}, nothing written.`);
    return;
  }
  const fullPath = path.join(LEADS_DIR, filename);
  const columns = [
    'name',
    'company',
    'city',
    'type',
    'source',
    'website',
    'contact_name',
    'contact_email',
    'notes'
  ];
  const csv = stringify(rowsOut, { header: true, columns });
  fs.writeFileSync(fullPath, csv, 'utf8');
  console.log(`Wrote ${rowsOut.length} rows to ${fullPath}`);
}

writeLeadsCsv('apollo-agencies-us-catchall-leads.csv', agencyLeads);
writeLeadsCsv('apollo-prodpost-us-catchall-leads.csv', prodpostLeads);
