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
const PAGE_STATE_PATH = path.join(LEADS_DIR, 'scout-apollo-page-state.json');
const QUERY_STATE_PATH = path.join(LEADS_DIR, 'scout-apollo-query-state.json');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const DEFAULT_REVEAL_DELAY_MS = 750;
const MAX_PAGE = 20;
const EARLY_ROTATE_THRESHOLD = 5;

// Query rotation: each 20-page cycle uses a different set of keyword + title filters
// to expand the addressable pool beyond the first 500 people on any given query.
const QUERY_VARIANTS = [
  {
    name: 'Creative & Advertising Agencies — Executive/Director titles',
    q_organization_keyword_tags: [
      'advertising agency', 'creative agency', 'marketing agency', 'brand agency',
      'digital agency', 'PR agency', 'media agency', 'content agency',
      'social media agency', 'integrated agency', 'ad agency'
    ],
    person_titles: [
      'Executive Creative Director', 'Creative Director', 'Chief Creative Officer',
      'Managing Director', 'VP Creative', 'VP Marketing', 'Head of Production',
      'Executive Producer', 'Producer', 'Founder', 'Partner', 'President',
      'Account Director', 'Strategy Director', 'Brand Director'
    ]
  },
  {
    name: 'Brand & Design Studios — Senior IC titles',
    q_organization_keyword_tags: [
      'brand studio', 'design studio', 'creative studio', 'production studio',
      'motion studio', 'video production', 'content studio', 'editorial studio',
      'in-house agency', 'creative collective'
    ],
    person_titles: [
      'Senior Art Director', 'Art Director', 'Senior Designer', 'Design Director',
      'Senior Copywriter', 'Copy Director', 'Senior Strategist', 'Senior Producer',
      'Senior Account Manager', 'Creative Lead', 'Brand Lead', 'Creative Manager',
      'Content Director', 'Campaign Director'
    ]
  },
  {
    name: 'PR & Communications Agencies — Dept Head titles',
    q_organization_keyword_tags: [
      'public relations', 'PR firm', 'communications agency', 'media relations',
      'brand communications', 'integrated communications', 'reputation management',
      'influencer marketing', 'experiential marketing', 'events agency'
    ],
    person_titles: [
      'Chief Marketing Officer', 'Chief Communications Officer', 'VP of Communications',
      'VP of Brand', 'Head of Creative', 'Head of Brand', 'Head of Content',
      'Head of Strategy', 'Head of Marketing', 'Global Creative Director',
      'Group Creative Director', 'SVP Creative', 'SVP Marketing'
    ]
  },
  {
    name: 'Boutique & Independent Agencies — Owner/Founder titles',
    q_organization_keyword_tags: [
      'boutique agency', 'independent agency', 'creative consultancy',
      'marketing consultancy', 'brand consultancy', 'growth agency',
      'performance agency', 'influencer agency', 'media consultancy',
      'strategic communications'
    ],
    person_titles: [
      'Owner', 'Co-Founder', 'Founder', 'Managing Partner', 'Principal',
      'Creative Principal', 'Executive Director', 'Agency Principal',
      'CEO', 'COO', 'Chief Strategy Officer', 'Chief Brand Officer',
      'Chief Content Officer', 'Director'
    ]
  }
];

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
  // Apollo search results return last_name_obfuscated on limited plans; use it as fallback
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
        q_organization_types: ['agency'],
        organization_num_employees_ranges: ['11-50', '51-200', '201-500'],
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
    // Accept obfuscated last names (last_name_obfuscated) — reveal will unlock full data
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
      // Debug first reveal to see what Apollo actually returns
      console.log(`  [debug] reveal keys: ${Object.keys(merged || {}).join(', ')}`);
      console.log(`  [debug] email found: ${email || '(none)'}`);
    }
    if (email) {
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
      linkedin_url: p.linkedin_url || '',
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
        'linkedin_url',
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
