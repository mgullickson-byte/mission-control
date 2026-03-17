#!/usr/bin/env node

// Apollo job-change monitor for Studio Awesome / Select Casting.
// Pulls recently started producers/coordinators, reveals emails,
// dedupes, and appends to leads/new-producers-contacts.csv.

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
const CSV_PATH = path.join(LEADS_DIR, 'new-producers-contacts.csv');
const STATE_PATH = path.join(LEADS_DIR, 'new-producers-apollo-page-state.json');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const DEFAULT_REVEAL_DELAY_MS = 750;
const MAX_PAGE = 20;
const MAX_JOB_AGE_DAYS = 90;
const TITLES = [
  'Associate Producer',
  'Production Coordinator',
  'Post Production Coordinator',
  'Post Coordinator',
  'Junior Producer',
  'Assistant Producer',
  'Advertising Producer',
  'Integrated Producer'
];

const QUERY_VARIANTS = [
  {
    name: 'Ad Agency Producers',
    q_organization_types: ['agency'],
    q_organization_keyword_tags: [
      'advertising agency',
      'creative agency',
      'integrated agency',
      'brand agency',
      'marketing agency',
      'media agency',
      'social agency',
      'agency'
    ],
    person_titles: TITLES.filter((title) => !/Coordinator/.test(title))
  },
  {
    name: 'Production Company Coordinators',
    q_organization_types: ['company'],
    q_organization_keyword_tags: [
      'production company',
      'post production',
      'post-production',
      'media production',
      'entertainment company',
      'media entertainment',
      'commercial production',
      'content studio'
    ],
    person_titles: TITLES.filter((title) => /Coordinator|Producer/.test(title))
  }
];

const OUTPUT_COLUMNS = [
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

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { nextPage: 1, queryIndex: 0 };
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return {
      nextPage: Number(parsed.nextPage) > 0 ? Number(parsed.nextPage) : 1,
      queryIndex: Number(parsed.queryIndex) >= 0 ? Number(parsed.queryIndex) : 0
    };
  } catch {
    return { nextPage: 1, queryIndex: 0 };
  }
}

function saveState(nextPage, queryIndex) {
  fs.writeFileSync(STATE_PATH, JSON.stringify({ nextPage, queryIndex }, null, 2), 'utf8');
}

function loadEnv() {
  const env = { ...process.env };
  if (!fs.existsSync(ENV_PATH)) return env;
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!env[key]) env[key] = value;
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

function extractMatchedPerson(matchPayload) {
  if (!matchPayload || typeof matchPayload !== 'object') return null;
  if (matchPayload.person && typeof matchPayload.person === 'object') return matchPayload.person;
  if (matchPayload.contact && typeof matchPayload.contact === 'object') return matchPayload.contact;
  return matchPayload;
}

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

function parseIsoDate(value) {
  if (!value || typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCurrentEmploymentStartDate(person) {
  const history = Array.isArray(person?.employment_history) ? person.employment_history : [];
  const currentOrgName = getOrganizationName(person).trim().toLowerCase();

  const currentEntry = history.find((entry) => {
    const orgName = String(entry?.organization_name || entry?.company_name || entry?.organization?.name || '').trim().toLowerCase();
    if (!orgName) return false;
    if (entry?.current === true) return true;
    if (currentOrgName && orgName === currentOrgName) return true;
    return false;
  });

  const fallback = currentEntry || history[0] || null;
  return (
    parseIsoDate(fallback?.start_date) ||
    parseIsoDate(fallback?.started_at) ||
    parseIsoDate(person?.organization_start_date) ||
    parseIsoDate(person?.current_position_start_date) ||
    null
  );
}

function startedWithinDays(person, maxAgeDays) {
  const startDate = getCurrentEmploymentStartDate(person);
  if (!startDate) return false;
  const ageMs = Date.now() - startDate.getTime();
  if (ageMs < 0) return false;
  return ageMs <= maxAgeDays * 24 * 60 * 60 * 1000;
}

function buildOutputRow(person) {
  const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
  return {
    name,
    company: getOrganizationName(person),
    city: getOrganizationCity(person),
    type: 'Contact',
    source: 'Apollo – new producers job change monitor',
    website: getOrganizationWebsite(person),
    contact_name: name,
    contact_email: getPersonEmail(person),
    linkedin_url: person.linkedin_url || '',
    notes: person.title || ''
  };
}

async function run() {
  const env = loadEnv();
  const apiKey = env.APOLLO_API_KEY;
  const baseUrl = env.APOLLO_API_URL || 'https://api.apollo.io/api/v1';
  const revealDelayMs = Number(env.APOLLO_REVEAL_DELAY_MS || DEFAULT_REVEAL_DELAY_MS);

  if (!apiKey) {
    console.error('APOLLO_API_KEY is not set in .env.local or process env');
    process.exit(1);
  }

  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const { nextPage: currentPage, queryIndex } = loadState();
  const variant = QUERY_VARIANTS[queryIndex % QUERY_VARIANTS.length];
  const page2 = currentPage + 1;
  const isWrapping = page2 + 1 > MAX_PAGE;
  const nextRunPage = isWrapping ? 1 : page2 + 1;
  const nextQueryIndex = isWrapping ? (queryIndex + 1) % QUERY_VARIANTS.length : queryIndex;

  console.log(`Using query variant ${queryIndex % QUERY_VARIANTS.length + 1} of ${QUERY_VARIANTS.length}: ${variant.name}`);
  console.log(`Fetching Apollo pages ${currentPage} and ${page2} (next run will start at ${nextRunPage}${isWrapping ? `, advancing to variant ${nextQueryIndex + 1}` : ''})`);

  async function fetchPage(page) {
    const url = new URL('mixed_people/api_search', base);
    url.searchParams.set('person_locations[]', 'United States');
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
        q_organization_types: variant.q_organization_types,
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

  const revealCandidates = people.filter((person) => {
    const orgName = getOrganizationName(person);
    const hasName = Boolean(person?.first_name && (person?.last_name || person?.last_name_obfuscated));
    return Boolean(orgName && hasName);
  });

  console.log('People eligible for reveal:', revealCandidates.length);

  const revealedPeople = [];
  for (const [index, person] of revealCandidates.entries()) {
    const name = [person.first_name, person.last_name || person.last_name_obfuscated].filter(Boolean).join(' ').trim();
    console.log(`Revealing ${index + 1}/${revealCandidates.length}: ${name} @ ${getOrganizationName(person)}`);
    const revealed = await revealPerson(base, apiKey, person, Number.isFinite(revealDelayMs) ? revealDelayMs : DEFAULT_REVEAL_DELAY_MS);
    const matchedPerson = extractMatchedPerson(revealed);
    const merged = matchedPerson && typeof matchedPerson === 'object'
      ? { ...person, ...matchedPerson, organization: matchedPerson.organization || person.organization }
      : person;
    if (!getPersonEmail(merged)) continue;
    if (!startedWithinDays(merged, MAX_JOB_AGE_DAYS)) continue;
    revealedPeople.push(merged);
  }

  console.log(`People with revealed email and current job start within ${MAX_JOB_AGE_DAYS} days: ${revealedPeople.length}`);

  const leadIndex = loadLeadIndexFromCsv(CSV_PATH);
  const newRows = [];
  for (const row of revealedPeople.map(buildOutputRow)) {
    if (!row.company || !row.contact_email) continue;
    if (isDuplicateLead(row, leadIndex)) continue;
    newRows.push(row);
    addLeadToIndex(row, leadIndex);
  }

  saveState(nextRunPage, nextQueryIndex);

  if (newRows.length === 0) {
    console.log('No new leads to add.');
    return;
  }

  let csvOut = '';
  if (fs.existsSync(CSV_PATH)) {
    csvOut = fs.readFileSync(CSV_PATH, 'utf8').trimEnd();
    if (!csvOut.endsWith('\n')) csvOut += '\n';
    csvOut += stringify(newRows, { header: false });
  } else {
    csvOut = stringify(newRows, { header: true, columns: OUTPUT_COLUMNS });
  }

  fs.writeFileSync(CSV_PATH, csvOut, 'utf8');
  console.log(`Appended ${newRows.length} new rows to ${CSV_PATH}`);
}

run().catch((err) => {
  console.error('Error in new producers Apollo script', err);
  process.exit(1);
});
