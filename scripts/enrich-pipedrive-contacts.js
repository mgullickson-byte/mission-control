#!/usr/bin/env node
/**
 * enrich-pipedrive-contacts.js
 * 
 * Enriches Pipedrive Person records with:
 * - Role field (mapped from job title)
 * - City/state on linked Organization records
 * 
 * Sources: apollo-agencies-us-leads.csv, apollo-prod-us-leads.csv,
 *          agency-production-contacts-verified.csv, selectvo-all-contacts-verified.csv
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'aa975d4352a516af8813c1b02fd4c1b7633b4436';
const LEADS_DIR = path.join(__dirname, '../leads');

// Role Type field key
const ROLE_FIELD_KEY = '2b0d71368a5a03dd1408104c74a356c97590d535';

// Org address fields
const ORG_CITY_KEY = 'address_locality';
const ORG_STATE_KEY = 'address_admin_area_level_1';

// Role type mapping from titles
function mapRole(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('executive producer') || t.includes('ep')) return 'Executive Producer';
  if (t.includes('producer') && !t.includes('executive')) return 'Producer';
  if (t.includes('creative director') || t.includes('ecd') || t.includes('chief creative')) return 'Creative Director';
  if (t.includes('creative') || t.includes('art director') || t.includes('copywriter')) return 'Creative';
  if (t.includes('business affairs') || t.includes('ba ') || t.includes('rights')) return 'Business Affairs';
  if (t.includes('account') || t.includes('client service') || t.includes('account director')) return 'Account';
  if (t.includes('president') || t.includes('ceo') || t.includes('founder') || t.includes('owner') || t.includes('partner') || t.includes('managing director') || t.includes('head of')) return 'Leadership';
  if (t.includes('casting')) return 'Casting';
  return null;
}

// Parse CSV (simple, handles quoted fields)
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim());
    return obj;
  });
}

// API helper
function apiCall(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.pipedrive.com/v1${endpoint}`);
    url.searchParams.set('api_token', API_KEY);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getAllPersons() {
  console.log('Fetching all Pipedrive persons...');
  let all = [], start = 0, limit = 500;
  while (true) {
    const res = await apiCall('GET', `/persons?limit=${limit}&start=${start}`);
    if (!res.data || res.data.length === 0) break;
    all = all.concat(res.data);
    console.log(`  Fetched ${all.length} persons...`);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
    await sleep(200);
  }
  return all;
}

async function getAllOrgs() {
  console.log('Fetching all Pipedrive organizations...');
  let all = [], start = 0, limit = 500;
  while (true) {
    const res = await apiCall('GET', `/organizations?limit=${limit}&start=${start}`);
    if (!res.data || res.data.length === 0) break;
    all = all.concat(res.data);
    console.log(`  Fetched ${all.length} orgs...`);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += limit;
    await sleep(200);
  }
  return all;
}

async function main() {
  // Build email → enrichment map from CSVs
  console.log('\nBuilding enrichment map from CSV sources...');
  const enrichMap = {}; // email → { city, state, title }

  // Apollo agencies
  const apolloAgencies = parseCSV(path.join(LEADS_DIR, 'apollo-agencies-us-leads.csv'));
  for (const r of apolloAgencies) {
    const email = (r.contact_email || '').toLowerCase().trim();
    if (!email) continue;
    const [city, state] = (r.city || '').split(',').map(s => s.trim());
    enrichMap[email] = { city, state, title: r.notes || '', company: r.company };
  }

  // Apollo prod
  const apolloProd = parseCSV(path.join(LEADS_DIR, 'apollo-prod-us-leads.csv'));
  for (const r of apolloProd) {
    const email = (r.contact_email || '').toLowerCase().trim();
    if (!email) continue;
    const [city, state] = (r.city || '').split(',').map(s => s.trim());
    if (!enrichMap[email]) enrichMap[email] = {};
    enrichMap[email].city = enrichMap[email].city || city;
    enrichMap[email].state = enrichMap[email].state || state;
    enrichMap[email].title = enrichMap[email].title || r.notes || '';
    enrichMap[email].company = enrichMap[email].company || r.name;
  }

  // Agency production contacts verified
  const agencyVerified = parseCSV(path.join(LEADS_DIR, 'agency-production-contacts-verified.csv'));
  for (const r of agencyVerified) {
    const email = (r.email || '').toLowerCase().trim();
    if (!email) continue;
    if (!enrichMap[email]) enrichMap[email] = {};
    enrichMap[email].city = enrichMap[email].city || r.city || '';
    enrichMap[email].title = enrichMap[email].title || r.title || '';
    enrichMap[email].company = enrichMap[email].company || r.company_name;
  }

  console.log(`  Enrichment map: ${Object.keys(enrichMap).length} emails`);

  // Get all Pipedrive data
  const persons = await getAllPersons();
  const orgs = await getAllOrgs();

  // Build org map: id → org
  const orgMap = {};
  for (const org of orgs) orgMap[org.id] = org;

  // Build company name → org id map
  const orgNameMap = {};
  for (const org of orgs) {
    orgNameMap[org.name.toLowerCase().trim()] = org.id;
  }

  console.log(`\nPersons: ${persons.length} | Orgs: ${orgs.length}`);

  // --- PASS 1: Update Person Role field ---
  console.log('\n=== PASS 1: Updating Person Role fields ===');
  let personUpdated = 0, personSkipped = 0, personNoMatch = 0;

  for (const person of persons) {
    const emails = (person.email || []).map(e => (e.value || '').toLowerCase().trim()).filter(Boolean);
    let enrichData = null;
    for (const e of emails) {
      if (enrichMap[e]) { enrichData = enrichMap[e]; break; }
    }

    if (!enrichData) { personNoMatch++; continue; }

    const existingRole = person[ROLE_FIELD_KEY];
    const newRole = mapRole(enrichData.title);

    if (!newRole) { personSkipped++; continue; }
    if (existingRole === newRole) { personSkipped++; continue; }

    try {
      await apiCall('PUT', `/persons/${person.id}`, { [ROLE_FIELD_KEY]: newRole });
      console.log(`  ✓ ${person.name} → ${newRole}`);
      personUpdated++;
      await sleep(150);
    } catch(e) {
      console.error(`  ✗ ${person.name}: ${e.message}`);
    }
  }

  console.log(`\nPerson Role: ${personUpdated} updated | ${personSkipped} skipped | ${personNoMatch} no match`);

  // --- PASS 2: Update Org city/state ---
  console.log('\n=== PASS 2: Updating Organization city/state ===');
  let orgUpdated = 0, orgSkipped = 0;

  // Build a map: org name → best city/state from enrichment data
  const orgCityMap = {}; // orgName → { city, state }
  for (const [email, data] of Object.entries(enrichMap)) {
    if (!data.company || !data.city) continue;
    const key = data.company.toLowerCase().trim();
    if (!orgCityMap[key]) orgCityMap[key] = { city: data.city, state: data.state };
  }

  for (const org of orgs) {
    // Skip if already has city
    if (org.address_locality && org.address_locality.trim()) { orgSkipped++; continue; }

    const key = org.name.toLowerCase().trim();
    const cityData = orgCityMap[key];
    if (!cityData || !cityData.city) { orgSkipped++; continue; }

    try {
      const updateBody = {
        address_locality: cityData.city,
        address_admin_area_level_1: cityData.state || '',
        address_country: 'United States'
      };
      await apiCall('PUT', `/organizations/${org.id}`, updateBody);
      console.log(`  ✓ ${org.name} → ${cityData.city}, ${cityData.state}`);
      orgUpdated++;
      await sleep(150);
    } catch(e) {
      console.error(`  ✗ ${org.name}: ${e.message}`);
    }
  }

  console.log(`\nOrg city/state: ${orgUpdated} updated | ${orgSkipped} skipped/already set`);
  console.log('\n✅ Enrichment complete!');
}

main().catch(console.error);
