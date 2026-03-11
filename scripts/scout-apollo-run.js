#!/usr/bin/env node

// One-off Scout pipeline runner for Select small/mid agencies.
// Calls Apollo, normalizes results, de-duplicates, and appends to
// leads/select-small-mid-agencies-us.csv.

const fs = require('node:fs');
const path = require('node:path');
const { stringify } = require('csv-stringify/sync');
const {
  addLeadToIndex,
  isDuplicateLead,
  loadLeadIndexFromCsv
} = require('./apollo-dedupe-helpers');

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const CSV_PATH = path.join(LEADS_DIR, 'select-small-mid-agencies-us.csv');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const DEFAULT_REVEAL_DELAY_MS = 750;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOrganizationName(person) {
  return (
    person?.organization?.name ||
    person?.organization?.organization_name ||
    person?.organization_name ||
    person?.account?.name ||
    ''
  );
}

function getOrganizationCity(person) {
  return (
    person?.organization?.city ||
    person?.organization?.location ||
    person?.city ||
    person?.location ||
    ''
  );
}

function getOrganizationWebsite(person) {
  return (
    person?.organization?.website_url ||
    person?.organization?.website ||
    person?.website_url ||
    person?.website ||
    ''
  );
}

function getPersonEmail(person) {
  let email = person?.email || '';
  if (!email && Array.isArray(person?.emails) && person.emails.length > 0) {
    email = person.emails[0]?.email || person.emails[0] || '';
  }
  return email;
}

async function revealPerson(base, apiKey, person, delayMs) {
  const organizationName = getOrganizationName(person);
  const firstName = person?.first_name || '';
  const lastName = person?.last_name || '';

  if (!firstName || !lastName || !organizationName) {
    return null;
  }

  const url = new URL('people/match', base);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
      organization_name: organizationName
    })
  });

  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as raw text
  }

  if (!res.ok) {
    console.warn('Apollo reveal failed', res.status, {
      firstName,
      lastName,
      organizationName
    });
    if (delayMs > 0) await sleep(delayMs);
    return null;
  }

  if (delayMs > 0) await sleep(delayMs);
  return data;
}

function extractMatchedPerson(matchPayload) {
  if (!matchPayload || typeof matchPayload !== 'object') return null;
  if (matchPayload.person && typeof matchPayload.person === 'object') return matchPayload.person;
  if (matchPayload.contact && typeof matchPayload.contact === 'object') return matchPayload.contact;
  return matchPayload;
}

async function run() {
  const env = loadEnv();
  const apiKey = env.APOLLO_API_KEY;
  const baseUrl = env.APOLLO_API_URL || 'https://api.apollo.io/api/v1';
  const revealDelayMs = Number(env.APOLLO_REVEAL_DELAY_MS || DEFAULT_REVEAL_DELAY_MS);

  if (!apiKey) {
    console.error('APOLLO_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const url = new URL('mixed_people/api_search', base);
  url.searchParams.set('person_locations[]', 'United States');
  url.searchParams.set('page', '1');
  url.searchParams.set('per_page', '25');

  console.log('Calling Apollo at', url.toString());

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify({
      q_organization_types: ['agency'],
      organization_num_employees_ranges: ['11-50', '51-200', '201-500']
    })
  });

  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as raw text
  }

  if (!res.ok) {
    console.error('Apollo API error', res.status, data);
    process.exit(1);
  }

  // mixed_people/api_search returns people; each person has an organization.
  const people = Array.isArray(data?.people) ? data.people : [];

  console.log('Apollo people returned:', people.length);

  if (people.length > 0) {
    console.log('Sample person keys:', Object.keys(people[0]));
    if (people[0].organization) {
      console.log('Sample organization keys:', Object.keys(people[0].organization));
    }
  }

  const revealCandidates = people.filter((p) => {
    const organizationName = getOrganizationName(p);
    return Boolean(
      organizationName &&
        p?.first_name &&
        p?.last_name &&
        (p?.has_email === true || getPersonEmail(p))
    );
  });

  console.log('People eligible for reveal:', revealCandidates.length);
  console.log('Reveal delay (ms):', Number.isFinite(revealDelayMs) ? revealDelayMs : DEFAULT_REVEAL_DELAY_MS);

  const revealedPeople = [];
  for (const [index, person] of revealCandidates.entries()) {
    const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
    console.log(`Revealing ${index + 1}/${revealCandidates.length}: ${name} @ ${getOrganizationName(person)}`);
    const revealed = await revealPerson(base, apiKey, person, Number.isFinite(revealDelayMs) ? revealDelayMs : DEFAULT_REVEAL_DELAY_MS);
    const matchedPerson = extractMatchedPerson(revealed);
    const merged = matchedPerson && typeof matchedPerson === 'object'
      ? { ...person, ...matchedPerson, organization: matchedPerson.organization || person.organization }
      : person;
    if (getPersonEmail(merged)) {
      revealedPeople.push(merged);
    }
  }

  console.log('People with revealed email + organization:', revealedPeople.length);

  const normalized = revealedPeople.map((p) => {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    const email = getPersonEmail(p);
    const orgWebsite = getOrganizationWebsite(p);

    return {
      name,
      company: getOrganizationName(p),
      city: getOrganizationCity(p),
      type: 'Agency',
      source: 'Apollo – contacts (revealed)',
      website: orgWebsite,
      contact_name: name,
      contact_email: email,
      notes: p.title || ''
    };
  });

  const leadIndex = loadLeadIndexFromCsv(CSV_PATH);
  const newRows = [];

  for (const row of normalized) {
    if (!row.company || !row.contact_email) continue;
    if (isDuplicateLead(row, leadIndex)) continue;
    newRows.push(row);
    addLeadToIndex(row, leadIndex);
  }

  if (newRows.length === 0) {
    console.log('No new leads to add (all duplicates).');
    return;
  }

  console.log('New leads to append:', newRows.length);

  let csvOut = '';
  if (fs.existsSync(CSV_PATH)) {
    csvOut = fs.readFileSync(CSV_PATH, 'utf8').trimEnd();
    if (!csvOut.endsWith('\n')) csvOut += '\n';
    csvOut += stringify(newRows, { header: false });
  } else {
    csvOut = stringify(newRows, {
      header: true,
      columns: [
        'name',
        'company',
        'city',
        'type',
        'source',
        'website',
        'contact_name',
        'contact_email',
        'notes'
      ]
    });
  }

  fs.writeFileSync(CSV_PATH, csvOut, 'utf8');
  console.log('Appended new rows to', CSV_PATH);
}

run().catch((err) => {
  console.error('Error in Scout Apollo script', err);
  process.exit(1);
});
