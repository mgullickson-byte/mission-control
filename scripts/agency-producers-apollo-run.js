#!/usr/bin/env node

// Agency Producers pipeline — pulls Heads of Production at ad agencies from Apollo.
// Appends to leads/agency-production-contacts.csv.
// Dedupes against both leads/studio-production-contacts.csv (manual export) and
// leads/agency-production-contacts.csv (accumulated pipeline output).

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const CSV_PATH = path.join(LEADS_DIR, 'agency-production-contacts.csv');
const MANUAL_REF_PATH = path.join(LEADS_DIR, 'studio-production-contacts.csv');
const PAGE_STATE_PATH = path.join(LEADS_DIR, 'agency-producers-page-state.json');
const QUERY_STATE_PATH = path.join(LEADS_DIR, 'agency-producers-query-state.json');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const DEFAULT_REVEAL_DELAY_MS = 750;
const MAX_PAGE = 20;
const EARLY_ROTATE_THRESHOLD = 5;

const QUERY_VARIANTS = [
  {
    name: 'Agency Heads of Production',
    q_organization_keyword_tags: [
      'advertising agency', 'creative agency', 'integrated agency',
      'ad agency', 'media agency', 'full service agency'
    ],
    person_titles: [
      'Head of Production', 'Executive Producer', 'Head of Integrated Production',
      'VP Production', 'Director of Production', 'SVP Production',
      'Head of Content Production', 'Chief Production Officer',
      'Executive in Charge of Production'
    ]
  },
  {
    name: 'Agency Broadcast & Post Production',
    q_organization_keyword_tags: [
      'advertising agency', 'broadcast production', 'post production',
      'creative agency', 'content production'
    ],
    person_titles: [
      'Broadcast Producer', 'Head of Broadcast', 'Broadcast Production Manager',
      'Director of Broadcast', 'Senior Producer', 'Group Executive Producer',
      'Managing Producer', 'Head of Post Production', 'VP Integrated Content'
    ]
  },
  {
    name: 'Creative Studio Production',
    q_organization_keyword_tags: [
      'brand studio', 'creative studio', 'production studio',
      'in-house agency', 'design studio'
    ],
    person_titles: [
      'Executive Producer', 'Head of Production', 'Senior Producer',
      'Creative Producer', 'Director of Production', 'Line Producer',
      'Managing Director'
    ]
  },
  {
    name: 'TV Networks & Streaming — Audio/Music',
    q_organization_keyword_tags: [
      'television network', 'streaming platform', 'entertainment company',
      'broadcast network', 'streaming service', 'media entertainment'
    ],
    person_titles: [
      'Music Supervisor', 'Supervising Sound Editor', 'Sound Supervisor',
      'Audio Director', 'Head of Audio', 'Director of Post Production',
      'VP Post Production', 'Post Production Supervisor', 'ADR Supervisor',
      'Sound Designer'
    ]
  }
];

// ---------------------------------------------------------------------------
// Dedupe helpers (uses email / company_name / city fields from this pipeline's CSV)
// ---------------------------------------------------------------------------

function buildDedupeIndex(csvPaths) {
  const emails = new Set();
  const companyCities = new Set();

  for (const csvPath of csvPaths) {
    if (!fs.existsSync(csvPath)) continue;
    const raw = fs.readFileSync(csvPath, 'utf8').trim();
    if (!raw) continue;
    const records = parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
    for (const rec of records) {
      const email = String(rec.email || '').trim().toLowerCase();
      const company = String(rec.company_name || '').trim().toLowerCase();
      const city = String(rec.city || '').trim().toLowerCase();
      if (email) emails.add(email);
      if (company && city) companyCities.add(`${company}::${city}`);
    }
  }

  return { emails, companyCities };
}

function isDuplicate(row, index) {
  const email = String(row.email || '').trim().toLowerCase();
  const company = String(row.company_name || '').trim().toLowerCase();
  const city = String(row.city || '').trim().toLowerCase();
  if (email && index.emails.has(email)) return true;
  if (company && city && index.companyCities.has(`${company}::${city}`)) return true;
  return false;
}

function addToIndex(row, index) {
  const email = String(row.email || '').trim().toLowerCase();
  const company = String(row.company_name || '').trim().toLowerCase();
  const city = String(row.city || '').trim().toLowerCase();
  if (email) index.emails.add(email);
  if (company && city) index.companyCities.add(`${company}::${city}`);
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function loadPageState() {
  if (!fs.existsSync(PAGE_STATE_PATH)) return { nextPage: 1 };
  try {
    return JSON.parse(fs.readFileSync(PAGE_STATE_PATH, 'utf8'));
  } catch {
    return { nextPage: 1 };
  }
}

function savePageState(nextPage) {
  fs.writeFileSync(PAGE_STATE_PATH, JSON.stringify({ nextPage }, null, 2), 'utf8');
}

function loadQueryState() {
  if (!fs.existsSync(QUERY_STATE_PATH)) return { queryIndex: 0 };
  try {
    return JSON.parse(fs.readFileSync(QUERY_STATE_PATH, 'utf8'));
  } catch {
    return { queryIndex: 0 };
  }
}

function saveQueryState(queryIndex) {
  fs.writeFileSync(QUERY_STATE_PATH, JSON.stringify({ queryIndex }, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Apollo field extraction helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Apollo reveal
// ---------------------------------------------------------------------------

async function revealPerson(base, apiKey, person, delayMs) {
  const organizationName = getOrganizationName(person);
  const firstName = person?.first_name || '';
  const lastName = person?.last_name || person?.last_name_obfuscated || '';
  const personId = person?.id || '';

  if (!personId && (!firstName || !organizationName)) {
    return null;
  }

  const url = new URL('people/match', base);

  const matchBody = personId
    ? { id: personId, reveal_personal_emails: false, reveal_phone_number: false }
    : { first_name: firstName, last_name: lastName, organization_name: organizationName };

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(matchBody)
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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

  const { nextPage: currentPage } = loadPageState();
  const { queryIndex } = loadQueryState();
  const variant = QUERY_VARIANTS[queryIndex % QUERY_VARIANTS.length];

  console.log(`Using query variant ${queryIndex % QUERY_VARIANTS.length + 1} of ${QUERY_VARIANTS.length}: ${variant.name}`);

  const page2 = currentPage + 1;
  const isWrapping = page2 + 1 > MAX_PAGE;
  const nextRunPage = isWrapping ? 1 : page2 + 1;
  const nextQueryIndex = isWrapping ? (queryIndex + 1) % QUERY_VARIANTS.length : queryIndex;

  console.log(`Fetching Apollo pages ${currentPage} and ${page2} (next run will start at ${nextRunPage}${isWrapping ? `, advancing to variant ${nextQueryIndex + 1}` : ''})`);

  async function fetchPage(page) {
    const url = new URL('mixed_people/api_search', base);
    url.searchParams.set('organization_locations[]', 'United States');
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '25');

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({
        organization_locations: ['United States'],
        q_organization_keyword_tags: variant.q_organization_keyword_tags,
        person_titles: variant.person_titles
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
      console.error(`Apollo API error on page ${page}`, res.status, data);
      process.exit(1);
    }

    return Array.isArray(data?.people) ? data.people : [];
  }

  const [peoplePage1, peoplePage2] = await Promise.all([fetchPage(currentPage), fetchPage(page2)]);
  const people = [...peoplePage1, ...peoplePage2];

  console.log(`Apollo people returned: ${peoplePage1.length} (page ${currentPage}) + ${peoplePage2.length} (page ${page2}) = ${people.length} total`);

  if (people.length > 0) {
    console.log('Sample person keys:', Object.keys(people[0]));
    if (people[0].organization) {
      console.log('Sample organization keys:', Object.keys(people[0].organization));
    }
  }

  const revealCandidates = people.filter((p) => {
    const organizationName = getOrganizationName(p);
    const hasName = Boolean(p?.first_name && (p?.last_name || p?.last_name_obfuscated));
    return Boolean(organizationName && hasName);
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
    const email = getPersonEmail(merged);
    if (index === 0) {
      console.log(`  [debug] reveal keys: ${Object.keys(merged || {}).join(', ')}`);
      console.log(`  [debug] email found: ${email || '(none)'}`);
    }
    if (email) {
      revealedPeople.push(merged);
    }
  }

  console.log('People with revealed email + organization:', revealedPeople.length);

  const normalized = revealedPeople.map((p) => {
    const lastName = p.last_name || p.last_name_obfuscated || '';
    return {
      first_name: p.first_name || '',
      last_name: lastName,
      email: getPersonEmail(p),
      company_name: getOrganizationName(p),
      website: getOrganizationWebsite(p),
      city: getOrganizationCity(p),
      title: p.title || ''
    };
  });

  // Dedupe against both the manual reference export and accumulated pipeline CSV
  const dedupeIndex = buildDedupeIndex([MANUAL_REF_PATH, CSV_PATH]);
  const newRows = [];

  for (const row of normalized) {
    if (!row.company_name || !row.email) continue;
    if (isDuplicate(row, dedupeIndex)) continue;
    newRows.push(row);
    addToIndex(row, dedupeIndex);
  }

  const didEarlyRotate = !isWrapping && newRows.length < EARLY_ROTATE_THRESHOLD;
  const finalNextPage = (isWrapping || didEarlyRotate) ? 1 : nextRunPage;
  const finalNextQueryIndex = (isWrapping || didEarlyRotate) ? (queryIndex + 1) % QUERY_VARIANTS.length : queryIndex;

  savePageState(finalNextPage);
  saveQueryState(finalNextQueryIndex);

  if (didEarlyRotate) {
    console.log(`[early-rotate] Only ${newRows.length} new leads (< ${EARLY_ROTATE_THRESHOLD}) — rotating to query variant ${finalNextQueryIndex + 1} of ${QUERY_VARIANTS.length} for next run.`);
  } else if (isWrapping) {
    console.log(`Cycle complete — advancing to query variant ${finalNextQueryIndex + 1} of ${QUERY_VARIANTS.length} for next run.`);
  }

  if (newRows.length === 0) {
    console.log('No new leads to add (all duplicates).');
    return;
  }

  console.log('New leads to append:', newRows.length);

  const CSV_COLUMNS = ['first_name', 'last_name', 'email', 'company_name', 'website', 'city', 'title'];

  let csvOut = '';
  if (fs.existsSync(CSV_PATH)) {
    csvOut = fs.readFileSync(CSV_PATH, 'utf8').trimEnd();
    if (!csvOut.endsWith('\n')) csvOut += '\n';
    csvOut += stringify(newRows, { header: false, columns: CSV_COLUMNS });
  } else {
    csvOut = stringify(newRows, { header: true, columns: CSV_COLUMNS });
  }

  fs.writeFileSync(CSV_PATH, csvOut, 'utf8');
  console.log('Appended new rows to', CSV_PATH);
}

run().catch((err) => {
  console.error('Error in Agency Producers Apollo script', err);
  process.exit(1);
});
