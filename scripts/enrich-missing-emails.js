#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const FORMAT_DB_PATH = path.join(LEADS_DIR, 'agency-email-formats.csv');
const LOG_PATH = path.join(LEADS_DIR, 'email-enrichment-log.csv');
const SMARTREACH_BATCH_PATH = path.join(LEADS_DIR, 'email-enrichment-smartreach.csv');
const SMARTREACH_STATE_PATH = path.join(LEADS_DIR, 'email-enrichment-smartreach-push-state.json');
const DEFAULT_TARGET_FILES = [
  'select-small-mid-agencies-us.csv',
  'studio-agencies.csv',
  'studio-brands.csv',
  'agency-production-contacts.csv'
];
const LOG_COLUMNS = ['company', 'name', 'guessed_email', 'mv_result', 'timestamp'];
const SMARTREACH_COLUMNS = ['first_name', 'last_name', 'email', 'company_name', 'website', 'city', 'title'];
const CONCURRENCY = 5;
const BATCH_DELAY_MS = 200;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

function loadEnv() {
  const env = {};
  if (!fs.existsSync(ENV_PATH)) return env;
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const files = [];
  let limit = Infinity;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && args[i + 1]) {
      files.push(args[++i]);
      continue;
    }
    if (arg === '--limit' && args[i + 1]) {
      limit = Number(args[++i]) || Infinity;
    }
  }

  return {
    files: files.length > 0 ? files : DEFAULT_TARGET_FILES,
    limit
  };
}

function readCsvIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function writeCsv(filePath, rows, columns) {
  fs.writeFileSync(filePath, stringify(rows, { header: true, columns }), 'utf8');
}

function normalizeWhitespace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.+$/, '');
}

function extractDomain(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
    return normalizeDomain(raw.split('@')[1]);
  }

  try {
    const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    return normalizeDomain(url.hostname);
  } catch {
    return '';
  }
}

function cleanNamePart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getFirstNonEmpty(row, keys) {
  for (const key of keys) {
    const value = normalizeWhitespace(row[key]);
    if (value) return value;
  }
  return '';
}

function splitFullName(value) {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return { first: '', last: '' };
  const parts = trimmed.split(' ').filter(Boolean);
  if (parts.length < 2) return { first: '', last: '' };
  return {
    first: parts[0],
    last: parts.slice(1).join(' ')
  };
}

function getNameParts(row) {
  const first = getFirstNonEmpty(row, ['first_name', 'First Name']);
  const last = getFirstNonEmpty(row, ['last_name', 'Last Name']);
  if (first && last) {
    return { first, last };
  }

  const fullName = getFirstNonEmpty(row, ['contact_name', 'name', 'Name']);
  return splitFullName(fullName);
}

function getPersonDisplayName(row) {
  const fullName = getFirstNonEmpty(row, ['contact_name', 'name', 'Name']);
  if (fullName) return fullName;
  const { first, last } = getNameParts(row);
  return [first, last].filter(Boolean).join(' ').trim();
}

function getEmailFieldName(row) {
  if (Object.prototype.hasOwnProperty.call(row, 'contact_email')) return 'contact_email';
  if (Object.prototype.hasOwnProperty.call(row, 'email')) return 'email';
  if (Object.prototype.hasOwnProperty.call(row, 'Email')) return 'Email';
  return 'contact_email';
}

function getWebsite(row) {
  return getFirstNonEmpty(row, ['website', 'Website']);
}

function getCompanyName(row) {
  return getFirstNonEmpty(row, ['company_name', 'company', 'Company Name', 'Company']);
}

function getCity(row) {
  return getFirstNonEmpty(row, ['city', 'City']);
}

function getTitle(row) {
  return getFirstNonEmpty(row, ['title', 'Title', 'notes']);
}

function buildSmartReachRow(row, guessedEmail) {
  const { first, last } = getNameParts(row);
  return {
    first_name: first,
    last_name: last,
    email: guessedEmail,
    company_name: getCompanyName(row),
    website: getWebsite(row),
    city: getCity(row),
    title: getTitle(row)
  };
}

function listNameForFile(filePath) {
  const base = path.basename(filePath);
  if (base === 'select-small-mid-agencies-us.csv') return 'Select - Small Mid Agencies';
  if (base === 'studio-agencies.csv' || base === 'studio-brands.csv') return 'Studio Awesome - Brands & Agencies';
  if (base === 'agency-production-contacts.csv') return 'Studio Awesome - Agency Producers';
  return 'Email Enrichment';
}

function loadFormatDb() {
  if (!fs.existsSync(FORMAT_DB_PATH)) {
    console.error(`Format DB not found: ${FORMAT_DB_PATH}`);
    process.exit(1);
  }

  const rows = readCsvIfPresent(FORMAT_DB_PATH);
  const byDomain = new Map();
  const byCompany = new Map();

  for (const row of rows) {
    const domain = normalizeDomain(row.domain);
    const companyName = normalizeWhitespace(row.company_name).toLowerCase();
    const format = normalizeWhitespace(row.format);
    if (!domain || !format) continue;
    byDomain.set(domain, format);
    if (companyName && !byCompany.has(companyName)) {
      byCompany.set(companyName, domain);
    }
  }

  return { byDomain, byCompany };
}

function applyFormat(format, firstName, lastName, domain) {
  const first = cleanNamePart(firstName);
  const last = cleanNamePart(lastName);
  if (!first || !last || !domain) return '';

  const tokens = {
    '{first}': first,
    '{last}': last,
    '{f}': first.slice(0, 1),
    '{l}': last.slice(0, 1)
  };

  const localPart = format.replace(/\{first\}|\{last\}|\{f\}|\{l\}/g, (match) => tokens[match] || '');
  if (!/^[a-z0-9._-]+$/.test(localPart)) return '';
  return `${localPart}@${domain}`;
}

async function verifyEmail(mvConfig, email) {
  const { apiKey, baseUrl } = mvConfig;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL('v3/', base);
  url.searchParams.set('api', apiKey);
  url.searchParams.set('email', email);
  url.searchParams.set('timeout', '10');

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url.toString(), { method: 'GET' });
      let data;
      try {
        data = await res.json();
      } catch {
        return { result: 'error', quality: '', subresult: 'parse_error' };
      }

      return {
        result: data.result || 'error',
        quality: String(data.quality ?? ''),
        subresult: data.subresult || ''
      };
    } catch (err) {
      if (attempt === RETRY_ATTEMPTS) {
        return { result: 'error', quality: '', subresult: 'network_error' };
      }
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  return { result: 'error', quality: '', subresult: 'network_error' };
}

function loadPushState() {
  if (!fs.existsSync(SMARTREACH_STATE_PATH)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(SMARTREACH_STATE_PATH, 'utf8'));
    return new Set(Array.isArray(data.pushed) ? data.pushed : []);
  } catch {
    return new Set();
  }
}

function savePushState(pushedSet) {
  fs.writeFileSync(SMARTREACH_STATE_PATH, JSON.stringify({ pushed: Array.from(pushedSet) }, null, 2), 'utf8');
}

async function pushToSmartReach(env, pushesByList) {
  const apiKey = env.SMARTREACH_API_KEY;
  const baseUrl = (env.SMARTREACH_API_BASE || 'https://api.smartreach.io').replace(/\/$/, '');
  const teamId = parseInt(env.SMARTREACH_TEAM_ID, 10);

  if (!apiKey) {
    console.error('SMARTREACH_API_KEY not set in .env.local');
    process.exit(1);
  }
  if (!teamId) {
    console.error('SMARTREACH_TEAM_ID not set in .env.local');
    process.exit(1);
  }

  const pushedState = loadPushState();
  let pushed = 0;
  let duplicates = 0;
  let errors = 0;

  for (const [listName, rows] of pushesByList.entries()) {
    for (const row of rows) {
      const emailKey = normalizeEmail(row.email);
      if (!emailKey || pushedState.has(emailKey)) continue;

      const body = {
        list: listName,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        company: row.company_name,
        website: row.website,
        city: row.city,
        job_title: row.title,
        custom_fields: {}
      };

      try {
        const res = await fetch(`${baseUrl}/api/v1/prospects?team_id=${teamId}`, {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }

        if (!res.ok || (data && data.status === 'error')) {
          const duplicate =
            res.status === 422 ||
            (typeof data === 'object' && /duplicate|already exist/i.test(String(data.message || '')));
          if (duplicate) {
            duplicates++;
            pushedState.add(emailKey);
          } else {
            errors++;
            console.warn(`  [warn] SmartReach push failed for ${row.email}: ${typeof data === 'object' ? data.message || JSON.stringify(data) : data}`);
          }
        } else {
          pushed++;
          pushedState.add(emailKey);
        }
      } catch (err) {
        errors++;
        console.warn(`  [warn] SmartReach network error for ${row.email}: ${err.message}`);
      }

      if ((pushed + duplicates) % 25 === 0) {
        savePushState(pushedState);
      }

      await sleep(200);
    }
  }

  savePushState(pushedState);
  return { pushed, duplicates, errors };
}

function resolveTargetFiles(fileArgs) {
  return fileArgs.map((file) => (path.isAbsolute(file) ? file : path.join(LEADS_DIR, file)));
}

function appendLogRows(newRows) {
  const existing = readCsvIfPresent(LOG_PATH);
  writeCsv(LOG_PATH, existing.concat(newRows), LOG_COLUMNS);
}

async function main() {
  const args = parseArgs();
  const env = loadEnv();
  const mvConfig = {
    apiKey: env.MV_API_KEY,
    baseUrl: env.MV_API_URL || 'https://api.millionverifier.com/api'
  };

  if (!mvConfig.apiKey) {
    console.error('MV_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const formatDb = loadFormatDb();
  const targetFiles = resolveTargetFiles(args.files);
  const candidates = [];

  for (const filePath of targetFiles) {
    const rows = readCsvIfPresent(filePath);
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const emailField = getEmailFieldName(row);
      const existingEmail = normalizeEmail(row[emailField]);
      const { first, last } = getNameParts(row);
      if (existingEmail || !first || !last) continue;

      const companyName = getCompanyName(row);
      const companyKey = companyName.toLowerCase();
      const domain =
        extractDomain(getWebsite(row)) ||
        extractDomain(existingEmail) ||
        formatDb.byCompany.get(companyKey) ||
        '';
      const format = domain ? formatDb.byDomain.get(domain) || '' : '';
      if (!domain || !format) continue;

      const guessedEmail = applyFormat(format, first, last, domain);
      if (!guessedEmail) continue;

      candidates.push({
        filePath,
        rows,
        row,
        rowIndex: index,
        emailField,
        companyName,
        displayName: getPersonDisplayName(row),
        guessedEmail,
        domain
      });
    }
  }

  const toProcess = candidates.slice(0, args.limit);
  const logRows = [];
  const smartReachRows = [];
  const pushesByList = new Map();
  let enriched = 0;

  console.log(`Eligible missing-email leads: ${candidates.length}`);
  console.log(`Processing now: ${toProcess.length}`);

  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (candidate) => {
        const verification = await verifyEmail(mvConfig, candidate.guessedEmail);
        return { candidate, verification };
      })
    );

    for (const { candidate, verification } of results) {
      const quality = String(verification.quality || '').toLowerCase();
      const isValid = verification.result === 'ok' && quality !== 'catchall';

      logRows.push({
        company: candidate.companyName,
        name: candidate.displayName,
        guessed_email: candidate.guessedEmail,
        mv_result: verification.result,
        timestamp: new Date().toISOString()
      });

      if (!isValid) continue;

      candidate.row[candidate.emailField] = candidate.guessedEmail;
      candidate.row.email_enriched = 'yes';
      enriched++;

      const smartReachRow = buildSmartReachRow(candidate.row, candidate.guessedEmail);
      smartReachRows.push(smartReachRow);
      const listName = listNameForFile(candidate.filePath);
      if (!pushesByList.has(listName)) {
        pushesByList.set(listName, []);
      }
      pushesByList.get(listName).push(smartReachRow);
    }

    console.log(`  Verified ${Math.min(i + CONCURRENCY, toProcess.length)}/${toProcess.length} guessed emails...`);
    if (i + CONCURRENCY < toProcess.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const touchedFiles = new Map();
  for (const candidate of toProcess) {
    touchedFiles.set(candidate.filePath, candidate.rows);
  }

  for (const [filePath, rows] of touchedFiles.entries()) {
    const existingColumns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const emailField = rows.length > 0 ? getEmailFieldName(rows[0]) : 'contact_email';
    const columns = existingColumns.includes('email_enriched')
      ? existingColumns
      : existingColumns.concat(existingColumns.includes(emailField) ? ['email_enriched'] : [emailField, 'email_enriched']);
    writeCsv(filePath, rows, columns);
    console.log(`Updated lead CSV: ${filePath}`);
  }

  appendLogRows(logRows);
  writeCsv(SMARTREACH_BATCH_PATH, smartReachRows, SMARTREACH_COLUMNS);

  const pushSummary = await pushToSmartReach(env, pushesByList);

  console.log(`Wrote enrichment log: ${LOG_PATH}`);
  console.log(`Wrote SmartReach batch: ${SMARTREACH_BATCH_PATH}`);
  console.log('');
  console.log('--- Summary ---');
  console.log(`Processed guesses: ${toProcess.length}`);
  console.log(`Valid enrichments: ${enriched}`);
  console.log(`SmartReach pushed: ${pushSummary.pushed}`);
  console.log(`SmartReach duplicates: ${pushSummary.duplicates}`);
  console.log(`SmartReach errors: ${pushSummary.errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
