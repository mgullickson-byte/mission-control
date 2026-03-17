#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const OUTPUT_PATH = path.join(LEADS_DIR, 'agency-email-formats.csv');
const DEFAULT_TARGET_FILES = [
  'select-small-mid-agencies-us.csv',
  'studio-agencies.csv',
  'studio-brands.csv',
  'agency-production-contacts.csv'
];
const BRAVE_DELAY_MS = 250;

const FORMAT_COLUMNS = ['company_name', 'domain', 'format', 'source', 'confidence', 'updated_at'];

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
  let limitDomains = Infinity;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--file' && args[i + 1]) {
      files.push(args[++i]);
      continue;
    }
    if (arg === '--limit-domains' && args[i + 1]) {
      limitDomains = Number(args[++i]) || Infinity;
    }
  }

  return {
    files: files.length > 0 ? files : DEFAULT_TARGET_FILES,
    limitDomains
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

function listLeadCsvFiles(dirPath) {
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      out.push(...listLeadCsvFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.csv')) {
      out.push(entryPath);
    }
  }
  return out;
}

function normalizeWhitespace(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeDomain(value) {
  const cleaned = String(value || '').trim().toLowerCase();
  if (!cleaned) return '';
  return cleaned.replace(/^www\./, '').replace(/\.+$/, '');
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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
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

function getEmail(row) {
  return normalizeEmail(getFirstNonEmpty(row, ['contact_email', 'email', 'Email']));
}

function getWebsite(row) {
  return getFirstNonEmpty(row, ['website', 'Website']);
}

function getCompanyName(row) {
  return getFirstNonEmpty(row, ['company_name', 'company', 'Company Name', 'Company']);
}

function candidateFormats(first, last) {
  const tokens = {
    '{first}': first,
    '{last}': last,
    '{f}': first.slice(0, 1),
    '{l}': last.slice(0, 1)
  };

  const patterns = [
    '{first}.{last}',
    '{first}_{last}',
    '{first}-{last}',
    '{first}{last}',
    '{f}{last}',
    '{f}.{last}',
    '{f}_{last}',
    '{f}-{last}',
    '{first}{l}',
    '{first}.{l}',
    '{first}_{l}',
    '{first}-{l}',
    '{last}.{first}',
    '{last}_{first}',
    '{last}-{first}',
    '{last}{first}',
    '{last}{f}',
    '{last}.{f}',
    '{last}_{f}',
    '{last}-{f}',
    '{first}',
    '{last}',
    '{f}{l}',
    '{f}.{l}',
    '{f}_{l}',
    '{f}-{l}'
  ];

  return patterns.map((format) => ({
    format,
    localPart: format.replace(/\{first\}|\{last\}|\{f\}|\{l\}/g, (match) => tokens[match] || '')
  }));
}

function inferFormatFromEmail(email, firstName, lastName) {
  const localPart = email.split('@')[0];
  const first = cleanNamePart(firstName);
  const last = cleanNamePart(lastName);

  if (!localPart || !first || !last) return '';

  for (const candidate of candidateFormats(first, last)) {
    if (candidate.localPart === localPart) {
      return candidate.format;
    }
  }

  return '';
}

function chooseMostCommonFormat(formatCounts) {
  let bestFormat = '';
  let bestCount = 0;
  for (const [format, count] of formatCounts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestFormat = format;
    }
  }
  return { format: bestFormat, count: bestCount };
}

function buildInferredFormats() {
  const countsByDomain = new Map();
  const leadFiles = listLeadCsvFiles(LEADS_DIR);

  for (const filePath of leadFiles) {
    const rows = readCsvIfPresent(filePath);
    for (const row of rows) {
      const email = getEmail(row);
      const { first, last } = getNameParts(row);
      if (!email || !first || !last) continue;

      const domain = extractDomain(email);
      const format = inferFormatFromEmail(email, first, last);
      if (!domain || !format) continue;

      let counts = countsByDomain.get(domain);
      if (!counts) {
        counts = new Map();
        countsByDomain.set(domain, counts);
      }
      counts.set(format, (counts.get(format) || 0) + 1);
    }
  }

  const inferred = new Map();
  for (const [domain, formatCounts] of countsByDomain.entries()) {
    const best = chooseMostCommonFormat(formatCounts);
    if (!best.format) continue;
    inferred.set(domain, {
      company_name: '',
      domain,
      format: best.format,
      source: 'inferred',
      confidence: 'high',
      updated_at: new Date().toISOString()
    });
  }
  return inferred;
}

function loadExistingFormatDb() {
  const rows = readCsvIfPresent(OUTPUT_PATH);
  const lookup = new Map();
  for (const row of rows) {
    const domain = normalizeDomain(row.domain);
    if (!domain) continue;
    lookup.set(domain, {
      company_name: normalizeWhitespace(row.company_name),
      domain,
      format: normalizeWhitespace(row.format),
      source: normalizeWhitespace(row.source),
      confidence: normalizeWhitespace(row.confidence),
      updated_at: normalizeWhitespace(row.updated_at)
    });
  }
  return lookup;
}

function resolveTargetFiles(fileArgs) {
  return fileArgs.map((file) => (path.isAbsolute(file) ? file : path.join(LEADS_DIR, file)));
}

function collectTargetDomains(filePaths) {
  const domainMap = new Map();

  for (const filePath of filePaths) {
    const rows = readCsvIfPresent(filePath);
    for (const row of rows) {
      const companyName = getCompanyName(row);
      const domain = extractDomain(getWebsite(row)) || extractDomain(getEmail(row));
      if (!domain) continue;

      const existing = domainMap.get(domain);
      if (!existing) {
        domainMap.set(domain, { domain, company_name: companyName });
        continue;
      }
      if (!existing.company_name && companyName) {
        existing.company_name = companyName;
      }
    }
  }

  return domainMap;
}

async function braveSearch(apiKey, query) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('country', 'US');
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('count', '5');
  url.searchParams.set('extra_snippets', 'true');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey
    }
  });

  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave raw
  }

  if (!res.ok) {
    throw new Error(`Brave API error ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }

  return Array.isArray(data?.web?.results) ? data.web.results : [];
}

function formatFromCapturedSeparator(tokenA, separator, tokenB) {
  return `${tokenA}${separator}${tokenB}`;
}

function extractFormatFromSnippet(text) {
  const raw = String(text || '');
  const lower = raw.toLowerCase();
  const compact = lower.replace(/[^a-z0-9._-]/g, '');

  const separatorPatterns = [
    {
      regex: /\b(first(?:name)?|fname)\s*([._-])\s*(last(?:name)?|lname)\b/i,
      build: (match) => formatFromCapturedSeparator('{first}', match[2], '{last}')
    },
    {
      regex: /\b(last(?:name)?|lname)\s*([._-])\s*(first(?:name)?|fname)\b/i,
      build: (match) => formatFromCapturedSeparator('{last}', match[2], '{first}')
    },
    {
      regex: /\b(first(?:name)?|fname)\s*([._-])\s*(last[\s-]*initial|lastinitial)\b/i,
      build: (match) => formatFromCapturedSeparator('{first}', match[2], '{l}')
    },
    {
      regex: /\b(last(?:name)?|lname)\s*([._-])\s*(first[\s-]*initial|firstinitial)\b/i,
      build: (match) => formatFromCapturedSeparator('{last}', match[2], '{f}')
    },
    {
      regex: /\b(first[\s-]*initial|firstinitial)\s*([._-])\s*(last(?:name)?|lname)\b/i,
      build: (match) => formatFromCapturedSeparator('{f}', match[2], '{last}')
    },
    {
      regex: /\b(first[\s-]*initial|firstinitial)\s*([._-])\s*(last[\s-]*initial|lastinitial)\b/i,
      build: (match) => formatFromCapturedSeparator('{f}', match[2], '{l}')
    }
  ];

  for (const pattern of separatorPatterns) {
    const match = raw.match(pattern.regex);
    if (match) return pattern.build(match);
  }

  const compactPatterns = [
    { regex: /firstnamelastname|fnamelname/, format: '{first}{last}' },
    { regex: /lastnamefirstname|lnamefname/, format: '{last}{first}' },
    { regex: /firstnamelastinitial/, format: '{first}{l}' },
    { regex: /lastnamefirstinitial/, format: '{last}{f}' },
    { regex: /firstinitiallastname/, format: '{f}{last}' },
    { regex: /firstinitiallastinitial/, format: '{f}{l}' },
    { regex: /firstname/, format: '{first}' },
    { regex: /lastname/, format: '{last}' }
  ];

  for (const pattern of compactPatterns) {
    if (pattern.regex.test(compact)) return pattern.format;
  }

  for (const exact of [
    ['firstname.lastname', '{first}.{last}'],
    ['firstname_lastname', '{first}_{last}'],
    ['firstname-lastname', '{first}-{last}'],
    ['lastname.firstname', '{last}.{first}'],
    ['lastname_firstname', '{last}_{first}'],
    ['lastname-firstname', '{last}-{first}'],
    ['firstinitial.lastname', '{f}.{last}'],
    ['firstinitial_lastname', '{f}_{last}'],
    ['firstinitial-lastname', '{f}-{last}'],
    ['firstname.lastinitial', '{first}.{l}'],
    ['firstname_lastinitial', '{first}_{l}'],
    ['firstname-lastinitial', '{first}-{l}']
  ]) {
    if (compact.includes(exact[0])) return exact[1];
  }

  return '';
}

function collectSnippetTexts(result) {
  const texts = [
    result?.title,
    result?.description,
    ...(Array.isArray(result?.extra_snippets) ? result.extra_snippets : [])
  ];
  return texts.map((value) => String(value || '').trim()).filter(Boolean);
}

function extractFormatFromResults(results) {
  for (const result of results) {
    for (const text of collectSnippetTexts(result)) {
      const format = extractFormatFromSnippet(text);
      if (format) return format;
    }
  }
  return '';
}

async function buildFormatDb() {
  const args = parseArgs();
  const env = loadEnv();
  const braveApiKey =
    env.BRAVE_API_KEY ||
    env.BRAVE_SEARCH_API_KEY ||
    env.BRAVE_SEARCH_KEY ||
    '';

  const targetFiles = resolveTargetFiles(args.files);
  const targetDomains = collectTargetDomains(targetFiles);
  const inferredFormats = buildInferredFormats();
  const existingDb = loadExistingFormatDb();
  const now = new Date().toISOString();
  const rowsByDomain = new Map(existingDb);

  for (const [domain, meta] of targetDomains.entries()) {
    const inferred = inferredFormats.get(domain);
    if (inferred) {
      rowsByDomain.set(domain, {
        ...inferred,
        company_name: meta.company_name || rowsByDomain.get(domain)?.company_name || '',
        updated_at: now
      });
      continue;
    }

    const existing = rowsByDomain.get(domain);
    if (existing && existing.format) {
      rowsByDomain.set(domain, {
        ...existing,
        company_name: existing.company_name || meta.company_name || '',
        updated_at: existing.updated_at || now
      });
      continue;
    }
  }

  const unknownDomains = Array.from(targetDomains.keys())
    .filter((domain) => !rowsByDomain.has(domain))
    .slice(0, args.limitDomains);

  if (unknownDomains.length > 0 && !braveApiKey) {
    console.error('BRAVE_API_KEY is not set in .env.local');
    process.exit(1);
  }

  console.log(`Target domains: ${targetDomains.size}`);
  console.log(`Inferred formats: ${Array.from(rowsByDomain.values()).filter((row) => row.source === 'inferred').length}`);
  console.log(`Brave lookups needed: ${unknownDomains.length}`);

  for (const [index, domain] of unknownDomains.entries()) {
    const meta = targetDomains.get(domain) || { company_name: '' };
    const query = `${domain} email format`;
    let format = '';

    try {
      const results = await braveSearch(braveApiKey, query);
      format = extractFormatFromResults(results);
    } catch (err) {
      console.warn(`  [warn] Brave search failed for ${domain}: ${err.message}`);
    }

    rowsByDomain.set(domain, {
      company_name: meta.company_name || '',
      domain,
      format: format || '{first}.{last}',
      source: format ? 'brave_search' : 'fallback',
      confidence: format ? 'medium' : 'low',
      updated_at: now
    });

    console.log(`  ${index + 1}/${unknownDomains.length} ${domain} -> ${rowsByDomain.get(domain).format} (${rowsByDomain.get(domain).source})`);

    if (index + 1 < unknownDomains.length) {
      await sleep(BRAVE_DELAY_MS);
    }
  }

  const finalRows = Array.from(rowsByDomain.values())
    .filter((row) => targetDomains.has(row.domain))
    .map((row) => ({
      company_name: row.company_name || targetDomains.get(row.domain)?.company_name || '',
      domain: row.domain,
      format: row.format,
      source: row.source,
      confidence: row.confidence,
      updated_at: row.updated_at || now
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));

  writeCsv(OUTPUT_PATH, finalRows, FORMAT_COLUMNS);
  console.log(`Wrote format DB: ${OUTPUT_PATH}`);
  console.log(`Rows written: ${finalRows.length}`);
}

buildFormatDb().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
