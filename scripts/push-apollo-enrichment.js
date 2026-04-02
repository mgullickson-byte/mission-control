#!/usr/bin/env node
/**
 * push-apollo-enrichment.js
 * Reads apollo-contacts-export_5.csv and updates Pipedrive Person records with:
 * - Role (mapped from Title)
 * - LinkedIn URL
 * - City/State on linked Organization
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'aa975d4352a516af8813c1b02fd4c1b7633b4436';
const ROLE_FIELD_KEY = '2b0d71368a5a03dd1408104c74a356c97590d535';
const LINKEDIN_FIELD_KEY = 'dbfc86eedf18145803d264afac8907d52596dde4';

function mapRole(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('executive producer') || t.includes('ep,') || t === 'ep') return 'Executive Producer';
  if (t.includes('producer') && !t.includes('executive') && !t.includes('post')) return 'Producer';
  if (t.includes('creative director') || t.includes('ecd') || t.includes('chief creative') || t.includes('acd')) return 'Creative Director';
  if (t.includes('creative') && !t.includes('director')) return 'Creative';
  if (t.includes('business affairs') || t.includes('ba,')) return 'Business Affairs';
  if (t.includes('account director') || t.includes('account manager') || t.includes('client service')) return 'Account';
  if (t.includes('president') || t.includes('ceo') || t.includes('founder') || t.includes('owner') || t.includes('partner') || t.includes('managing director') || t.includes('head of') || t.includes('chief')) return 'Leadership';
  if (t.includes('casting')) return 'Casting';
  if (t.includes('director') && !t.includes('creative') && !t.includes('art')) return 'Leadership';
  if (t.includes('vp') || t.includes('vice president')) return 'Leadership';
  if (t.includes('manager') || t.includes('supervisor')) return 'Producer';
  return null;
}

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = (vals[i] || '').trim());
    return obj;
  });
}

function parseCSVLine(line) {
  const vals = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
    else cur += ch;
  }
  vals.push(cur);
  return vals;
}

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
  let all = [], start = 0;
  while (true) {
    const res = await apiCall('GET', `/persons?limit=500&start=${start}`);
    if (!res.data || !res.data.length) break;
    all = all.concat(res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
    await sleep(200);
  }
  console.log(`  Got ${all.length} persons`);
  return all;
}

async function getAllOrgs() {
  console.log('Fetching all Pipedrive orgs...');
  let all = [], start = 0;
  while (true) {
    const res = await apiCall('GET', `/organizations?limit=500&start=${start}`);
    if (!res.data || !res.data.length) break;
    all = all.concat(res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
    await sleep(200);
  }
  console.log(`  Got ${all.length} orgs`);
  return all;
}

async function main() {
  const apolloData = parseCSV(path.join(__dirname, '../leads/apollo-contacts-export_5.csv'));
  console.log(`Apollo records: ${apolloData.length}`);

  // Build email → apollo data map
  const apolloMap = {};
  for (const r of apolloData) {
    const email = (r['Email'] || '').toLowerCase().trim();
    if (email) apolloMap[email] = r;
  }
  console.log(`Email map: ${Object.keys(apolloMap).length} entries`);

  const persons = await getAllPersons();
  const orgs = await getAllOrgs();

  // Build org id → org map
  const orgById = {};
  for (const o of orgs) orgById[o.id] = o;

  // Build org name → id map (for updating city/state)
  const orgByName = {};
  for (const o of orgs) orgByName[o.name.toLowerCase().trim()] = o;

  // Track org updates to avoid duplication
  const updatedOrgs = new Set();

  let personUpdated = 0, personSkipped = 0, orgUpdated = 0, orgSkipped = 0;

  console.log('\n=== Updating Person records ===');
  for (const person of persons) {
    const emails = (person.email || []).map(e => (e.value || '').toLowerCase().trim()).filter(Boolean);
    let apolloRec = null;
    for (const e of emails) {
      if (apolloMap[e]) { apolloRec = apolloMap[e]; break; }
    }
    if (!apolloRec) { personSkipped++; continue; }

    const newRole = mapRole(apolloRec['Title']);
    const existingRole = person[ROLE_FIELD_KEY];
    const newLinkedIn = (apolloRec['Person Linkedin Url'] || '').trim();
    const existingLinkedIn = person[LINKEDIN_FIELD_KEY] || '';

    const updates = {};
    if (newRole && (!existingRole || existingRole.trim() === '')) updates[ROLE_FIELD_KEY] = newRole;
    if (newLinkedIn && !existingLinkedIn) updates[LINKEDIN_FIELD_KEY] = newLinkedIn;

    if (Object.keys(updates).length > 0) {
      try {
        await apiCall('PUT', `/persons/${person.id}`, updates);
        const parts = [];
        if (updates[ROLE_FIELD_KEY]) parts.push(`Role: ${updates[ROLE_FIELD_KEY]}`);
        if (updates[LINKEDIN_FIELD_KEY]) parts.push('LinkedIn ✓');
        console.log(`  ✓ ${person.name} → ${parts.join(' | ')}`);
        personUpdated++;
        await sleep(120);
      } catch(e) {
        console.error(`  ✗ ${person.name}: ${e.message}`);
      }
    } else {
      personSkipped++;
    }

    // Update org city/state if we have it
    const orgId = person.org_id?.value;
    if (orgId && !updatedOrgs.has(orgId)) {
      const org = orgById[orgId];
      if (org && !org.address_locality) {
        const city = apolloRec['City'] || '';
        const state = apolloRec['State'] || '';
        if (city) {
          try {
            await apiCall('PUT', `/organizations/${orgId}`, {
              address_locality: city,
              address_admin_area_level_1: state,
              address_country: 'United States'
            });
            console.log(`    🏢 ${org.name} → ${city}, ${state}`);
            updatedOrgs.add(orgId);
            orgUpdated++;
            await sleep(120);
          } catch(e) {
            console.error(`    ✗ Org ${org.name}: ${e.message}`);
          }
        }
      } else {
        orgSkipped++;
      }
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`Persons: ${personUpdated} updated | ${personSkipped} skipped`);
  console.log(`Orgs: ${orgUpdated} updated | ${orgSkipped} skipped`);
}

main().catch(console.error);
