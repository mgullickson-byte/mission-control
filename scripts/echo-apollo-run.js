#!/usr/bin/env node

// Echo pipeline runner for Studio Awesome (ADR studio).
// Searches Apollo for production/post-production agencies and content brands,
// reveals emails, deduplicates, and appends to the respective leads CSVs.

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
const AGENCIES_CSV = path.join(LEADS_DIR, 'studio-agencies.csv');
const BRANDS_CSV = path.join(LEADS_DIR, 'studio-brands.csv');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const PAGE_STATE_PATH = path.join(LEADS_DIR, 'echo-apollo-page-state.json');
const QUERY_STATE_PATH = path.join(LEADS_DIR, 'echo-apollo-query-state.json');
const DEFAULT_REVEAL_DELAY_MS = 750;
const MAX_PAGE = 20;

// Query rotation: each 20-page cycle uses a different keyword/title set to
// prevent Apollo from returning the same people on every cycle reset.
const AGENCIES_QUERY_VARIANTS = [
  {
    name: 'Production Companies',
    q_organization_keyword_tags: [
      'film production', 'commercial production', 'television production',
      'video production', 'content production'
    ],
    person_titles: [
      'Producer', 'Executive Producer', 'Head of Production',
      'Post Production Supervisor', 'Director of Post Production', 'Line Producer'
    ],
    organization_locations: ['United States']
  },
  {
    name: 'Post-Production & Audio',
    q_organization_keyword_tags: [
      'post production', 'audio post', 'sound design', 'music production',
      'visual effects', 'animation studio'
    ],
    person_titles: [
      'Sound Supervisor', 'Audio Engineer', 'Post Production Coordinator',
      'VP Post', 'Head of Post', 'Executive Producer'
    ],
    organization_locations: ['United States']
  },
  {
    name: 'Ad Agency Production',
    q_organization_keyword_tags: [
      'advertising agency', 'creative agency', 'integrated agency',
      'production house', 'branded content'
    ],
    person_titles: [
      'Head of Production', 'Executive Producer', 'Producer',
      'Creative Producer', 'Content Producer'
    ],
    organization_locations: ['United States']
  }
];

const BRANDS_QUERY_VARIANTS = [
  {
    name: 'Gaming & Entertainment',
    q_organization_keyword_tags: [
      'video games', 'game studio', 'interactive entertainment',
      'streaming', 'entertainment company'
    ],
    person_titles: [
      'Head of Production', 'Executive Producer', 'Creative Director',
      'Audio Director', 'VP Content'
    ],
    organization_locations: ['United States']
  },
  {
    name: 'Consumer Brands/Media',
    q_organization_keyword_tags: [
      'consumer goods', 'media company', 'broadcast',
      'digital media', 'content creation'
    ],
    person_titles: [
      'VP Marketing', 'Executive Producer', 'Head of Content',
      'Creative Director', 'Director of Content'
    ],
    organization_locations: ['United States']
  },
  {
    name: 'Tech/Software',
    q_organization_keyword_tags: [
      'software company', 'technology', 'SaaS', 'mobile app', 'digital platform'
    ],
    person_titles: [
      'Head of Marketing', 'VP Marketing', 'Creative Director',
      'Brand Manager', 'Content Director'
    ],
    organization_locations: ['United States']
  }
];

const AGENCIES_SEARCH_META = {
  label: 'agencies',
  csvPath: AGENCIES_CSV,
  type: 'Agency',
  source: 'Apollo – Studio Awesome agencies (revealed)',
  baseBody: {
    q_organization_types: ['production_company', 'media_entertainment'],
    organization_num_employees_ranges: ['1-10', '11-50', '51-200']
  }
};

const BRANDS_SEARCH_META = {
  label: 'brands',
  csvPath: BRANDS_CSV,
  type: 'Brand',
  source: 'Apollo – Studio Awesome brands (revealed)',
  baseBody: {
    q_organization_types: ['consumer_goods', 'retail', 'media_entertainment', 'gaming'],
    organization_num_employees_ranges: ['51-200', '201-500', '501-1000']
  }
};

function loadEchoPageState() {
  if (!fs.existsSync(PAGE_STATE_PATH)) return { nextPage: 1 };
  try {
    return JSON.parse(fs.readFileSync(PAGE_STATE_PATH, 'utf8'));
  } catch {
    return { nextPage: 1 };
  }
}

function saveEchoPageState(nextPage) {
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

const CSV_COLUMNS = ['name', 'company', 'city', 'type', 'source', 'website', 'contact_name', 'contact_email', 'notes'];

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
  const lastName = person?.last_name || person?.last_name_obfuscated || '';
  const personId = person?.id || '';

  if (!personId && (!firstName || !organizationName)) {
    return null;
  }

  const url = new URL('people/match', base);

  // Build body: prefer ID-based lookup (most reliable), fall back to name+org
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
    console.warn('Apollo reveal failed', res.status, { firstName, lastName, organizationName });
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

async function fetchPage(base, apiKey, searchBody, page) {
  const url = new URL('mixed_people/api_search', base);
  url.searchParams.set('person_locations[]', 'United States');
  url.searchParams.set('page', String(page));
  url.searchParams.set('per_page', '25');

  console.log(`  Fetching page ${page} from Apollo...`);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(searchBody)
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
    return [];
  }

  return Array.isArray(data?.people) ? data.people : [];
}

async function runSearch(config, base, apiKey, revealDelayMs, startPage) {
  const { label, csvPath, type, source, body } = config;
  console.log(`\n=== Running ${label} search ===`);

  // Fetch 2 pages starting at startPage
  const allPeople = [];
  for (let page = startPage; page <= startPage + 1; page++) {
    const people = await fetchPage(base, apiKey, body, page);
    console.log(`  Page ${page}: ${people.length} people returned`);
    allPeople.push(...people);
  }

  console.log(`Total people fetched for ${label}:`, allPeople.length);

  const revealCandidates = allPeople.filter((p) => {
    const orgName = getOrganizationName(p);
    return Boolean(
      orgName &&
        p?.first_name &&
        (p?.last_name || p?.last_name_obfuscated) &&
        (p?.has_email === true || getPersonEmail(p))
    );
  });

  console.log(`People eligible for reveal (${label}):`, revealCandidates.length);

  const revealedPeople = [];
  for (const [index, person] of revealCandidates.entries()) {
    const name = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
    console.log(`  Revealing ${index + 1}/${revealCandidates.length}: ${name} @ ${getOrganizationName(person)}`);
    const revealed = await revealPerson(base, apiKey, person, revealDelayMs);
    const matchedPerson = extractMatchedPerson(revealed);
    const merged = matchedPerson && typeof matchedPerson === 'object'
      ? { ...person, ...matchedPerson, organization: matchedPerson.organization || person.organization }
      : person;
    if (getPersonEmail(merged)) {
      revealedPeople.push(merged);
    }
  }

  console.log(`People with revealed email (${label}):`, revealedPeople.length);

  const normalized = revealedPeople.map((p) => {
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    return {
      name,
      company: getOrganizationName(p),
      city: getOrganizationCity(p),
      type,
      source,
      website: getOrganizationWebsite(p),
      contact_name: name,
      contact_email: getPersonEmail(p),
      notes: p.title || ''
    };
  });

  const leadIndex = loadLeadIndexFromCsv(csvPath);
  const newRows = [];

  for (const row of normalized) {
    if (!row.company || !row.contact_email) continue;
    if (isDuplicateLead(row, leadIndex)) continue;
    newRows.push(row);
    addLeadToIndex(row, leadIndex);
  }

  if (newRows.length === 0) {
    console.log(`No new ${label} leads to add (all duplicates).`);
    return 0;
  }

  console.log(`New ${label} leads to append:`, newRows.length);

  let csvOut = '';
  if (fs.existsSync(csvPath)) {
    csvOut = fs.readFileSync(csvPath, 'utf8').trimEnd();
    if (!csvOut.endsWith('\n')) csvOut += '\n';
    csvOut += stringify(newRows, { header: false, columns: CSV_COLUMNS });
  } else {
    csvOut = stringify(newRows, { header: true, columns: CSV_COLUMNS });
  }

  fs.writeFileSync(csvPath, csvOut, 'utf8');
  console.log(`Appended ${newRows.length} row(s) to ${csvPath}`);
  return newRows.length;
}

async function run() {
  const env = loadEnv();
  const apiKey = env.APOLLO_API_KEY;
  const baseUrl = env.APOLLO_API_URL || 'https://api.apollo.io/api/v1';
  const revealDelayMs = Number(env.APOLLO_REVEAL_DELAY_MS || DEFAULT_REVEAL_DELAY_MS);
  const effectiveDelay = Number.isFinite(revealDelayMs) ? revealDelayMs : DEFAULT_REVEAL_DELAY_MS;

  if (!apiKey) {
    console.error('APOLLO_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

  const { nextPage: startPage } = loadEchoPageState();
  const { queryIndex } = loadQueryState();

  const agencyVariant = AGENCIES_QUERY_VARIANTS[queryIndex % AGENCIES_QUERY_VARIANTS.length];
  const brandVariant = BRANDS_QUERY_VARIANTS[queryIndex % BRANDS_QUERY_VARIANTS.length];

  console.log(`Active query variant ${(queryIndex % AGENCIES_QUERY_VARIANTS.length) + 1}/${AGENCIES_QUERY_VARIANTS.length}: agencies="${agencyVariant.name}", brands="${brandVariant.name}"`);

  const endPage = startPage + 1;
  const isWrapping = endPage + 1 > MAX_PAGE;
  const nextRunPage = isWrapping ? 1 : endPage + 1;
  const nextQueryIndex = isWrapping
    ? (queryIndex + 1) % AGENCIES_QUERY_VARIANTS.length
    : queryIndex;

  console.log(`Fetching Echo Apollo pages ${startPage} and ${endPage} (next run will start at ${nextRunPage}${isWrapping ? `, advancing to variant ${nextQueryIndex + 1}` : ''})`);

  const agenciesConfig = {
    ...AGENCIES_SEARCH_META,
    body: {
      ...AGENCIES_SEARCH_META.baseBody,
      q_organization_keyword_tags: agencyVariant.q_organization_keyword_tags,
      person_titles: agencyVariant.person_titles,
      organization_locations: agencyVariant.organization_locations
    }
  };

  const brandsConfig = {
    ...BRANDS_SEARCH_META,
    body: {
      ...BRANDS_SEARCH_META.baseBody,
      q_organization_keyword_tags: brandVariant.q_organization_keyword_tags,
      person_titles: brandVariant.person_titles,
      organization_locations: brandVariant.organization_locations
    }
  };

  const agenciesAdded = await runSearch(agenciesConfig, base, apiKey, effectiveDelay, startPage);
  const brandsAdded = await runSearch(brandsConfig, base, apiKey, effectiveDelay, startPage);

  saveEchoPageState(nextRunPage);
  if (isWrapping) saveQueryState(nextQueryIndex);

  console.log('\n=== Echo Apollo Run Complete ===');
  console.log(`Agency leads added:  ${agenciesAdded}`);
  console.log(`Brand leads added:   ${brandsAdded}`);
  console.log(`Total leads added:   ${agenciesAdded + brandsAdded}`);
}

run().catch((err) => {
  console.error('Error in Echo Apollo script:', err);
  process.exit(1);
});
