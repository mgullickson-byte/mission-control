#!/usr/bin/env node
/**
 * subscribe-active-clients.js
 * Marks sc-active-clients-12mo.csv contacts as marketing_status = subscribed in Pipedrive
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const API_KEY = 'aa975d4352a516af8813c1b02fd4c1b7633b4436';

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
    return obj;
  });
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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getAllPersons() {
  let all = [], start = 0;
  while (true) {
    const res = await apiCall('GET', `/persons?limit=500&start=${start}`);
    if (!res.data || !res.data.length) break;
    all = all.concat(res.data);
    if (!res.additional_data?.pagination?.more_items_in_collection) break;
    start += 500;
    await sleep(200);
  }
  return all;
}

async function main() {
  const clients = parseCSV(path.join(__dirname, '../leads/sc-active-clients-12mo.csv'));
  console.log(`Active clients: ${clients.length}`);

  const clientEmails = new Set(clients.map(c => c.email.toLowerCase().trim()).filter(Boolean));

  console.log('Fetching Pipedrive persons...');
  const persons = await getAllPersons();
  console.log(`Persons: ${persons.length}`);

  let updated = 0, skipped = 0, notFound = 0;

  for (const person of persons) {
    const emails = (person.email || []).map(e => (e.value || '').toLowerCase().trim());
    const match = emails.find(e => clientEmails.has(e));
    if (!match) { notFound++; continue; }

    if (person.marketing_status === 'subscribed') { skipped++; continue; }

    try {
      await apiCall('PUT', `/persons/${person.id}`, { marketing_status: 'subscribed' });
      console.log(`  ✓ ${person.name} (${match})`);
      updated++;
      await sleep(120);
    } catch(e) {
      console.error(`  ✗ ${person.name}: ${e.message}`);
    }
  }

  console.log(`\n✅ Done! Updated: ${updated} | Already subscribed: ${skipped} | Not found: ${notFound}`);
}

main().catch(console.error);
