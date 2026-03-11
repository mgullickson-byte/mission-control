#!/usr/bin/env node

// Build Mission Control-friendly leads CSVs from Apollo-verified outputs
// Input:
//   leads/apollo-select-agencies-us-valid.csv
//   leads/apollo-production-post-us-valid.csv
// Output:
//   leads/apollo-agencies-us-leads.csv
//   leads/apollo-prodpost-us-leads.csv
// Columns:
//   name,company,city,type,source,website,contact_name,contact_email,notes

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');

function loadCsv(filename) {
  const fullPath = path.join(LEADS_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    console.error('Input CSV not found:', fullPath);
    process.exit(1);
  }
  const raw = fs.readFileSync(fullPath, 'utf8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
}

function buildLeads(records, opts) {
  const { type, sourceLabel } = opts;

  return records.map((row) => {
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
  });
}

function writeLeadsCsv(filename, rows) {
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
  const csv = stringify(rows, { header: true, columns });
  fs.writeFileSync(fullPath, csv, 'utf8');
  console.log(`Wrote ${rows.length} rows to ${fullPath}`);
}

function main() {
  const agencies = loadCsv('apollo-select-agencies-us-valid.csv');
  const prodpost = loadCsv('apollo-production-post-us-valid.csv');

  const agencyLeads = buildLeads(agencies, {
    type: 'Agency',
    sourceLabel: 'Apollo – Agency producers (US, MV ok)'
  });

  const prodpostLeads = buildLeads(prodpost, {
    type: 'Prod',
    sourceLabel: 'Apollo – Production/Post EPs (US, MV ok)'
  });

  writeLeadsCsv('apollo-agencies-us-leads.csv', agencyLeads);
  writeLeadsCsv('apollo-prodpost-us-leads.csv', prodpostLeads);
}

main();
