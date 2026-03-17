#!/usr/bin/env node

// Brave-powered social/news monitor for Select small/mid agencies.
// Rotates through the agency list and appends campaign signals to CSV.

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const INPUT_PATH = path.join(ROOT_DIR, 'leads', 'select-small-mid-agencies-us.csv');
const OUTPUT_PATH = path.join(ROOT_DIR, 'leads', 'social-campaign-signals.csv');
const STATE_PATH = path.join(ROOT_DIR, 'leads', 'social-monitor-state.json');

const DEFAULT_BATCH_SIZE = 20;
const REQUEST_DELAY_MS = 1000;
const QUERY_TEMPLATES = [
  '"{agency_name}" advertising agency new commercial',
  '"{agency_name}" ad agency new campaign 2025 OR 2026',
  '"{agency_name}" agency new spot launch',
  '"{agency_name}" creative agency campaign launches'
];
const OUTPUT_COLUMNS = [
  'agency_name',
  'post_title',
  'snippet',
  'url',
  'published_date',
  'signal_type'
];

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: DEFAULT_BATCH_SIZE,
    noSaveState: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = Math.max(1, Math.min(DEFAULT_BATCH_SIZE, Number(args[++i]) || DEFAULT_BATCH_SIZE));
    } else if (args[i] === '--no-save-state') {
      options.noSaveState = true;
    }
  }

  return options;
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

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { nextAgencyIndex: 0, nextQueryIndex: 0 };
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return {
      nextAgencyIndex: Number(parsed.nextAgencyIndex) >= 0 ? Number(parsed.nextAgencyIndex) : 0,
      nextQueryIndex: Number(parsed.nextQueryIndex) >= 0 ? Number(parsed.nextQueryIndex) : 0
    };
  } catch {
    return { nextAgencyIndex: 0, nextQueryIndex: 0 };
  }
}

function saveState(nextAgencyIndex, nextQueryIndex) {
  fs.writeFileSync(STATE_PATH, JSON.stringify({ nextAgencyIndex, nextQueryIndex }, null, 2), 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return parse(raw, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function getAgencyName(row) {
  return String(row.company_name || row.company || row.name || '').trim();
}

function uniqueAgencyNames(rows) {
  const seen = new Set();
  const names = [];
  for (const row of rows) {
    const name = getAgencyName(row);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function loadExistingUrlSet() {
  if (!fs.existsSync(OUTPUT_PATH)) return new Set();
  const records = readCsv(OUTPUT_PATH);
  return new Set(records.map((record) => String(record.url || '').trim()).filter(Boolean));
}

function buildAgencyBatch(agencies, startIndex, limit) {
  if (agencies.length === 0) return { batch: [], nextAgencyIndex: 0 };
  const batch = [];
  let index = startIndex % agencies.length;

  while (batch.length < Math.min(limit, agencies.length)) {
    batch.push(agencies[index]);
    index = (index + 1) % agencies.length;
    if (index === startIndex % agencies.length) break;
  }

  return { batch, nextAgencyIndex: index };
}

function extractPublishedDate(result) {
  const candidates = [
    result?.page_age,
    result?.age,
    result?.page_age_display,
    result?.published,
    result?.published_date,
    result?.date
  ];

  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) return String(candidate).trim();
  }

  const description = String(result?.description || '');
  const match = description.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return match ? match[0] : '';
}

function normalizeSignal(agencyName, result) {
  return {
    agency_name: agencyName,
    post_title: String(result?.title || '').trim(),
    snippet: String(result?.description || '').trim(),
    url: String(result?.url || '').trim(),
    published_date: extractPublishedDate(result),
    signal_type: 'new_campaign'
  };
}

async function braveSearch(apiKey, query) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('country', 'US');
  url.searchParams.set('search_lang', 'en');
  url.searchParams.set('freshness', 'pm');
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

async function main() {
  const { limit, noSaveState } = parseArgs();
  const env = loadEnv();
  const braveApiKey =
    env.BRAVE_API_KEY ||
    env.BRAVE_SEARCH_API_KEY ||
    env.BRAVE_SEARCH_KEY ||
    '';

  if (!braveApiKey) {
    console.error('BRAVE_API_KEY is not set in .env.local or process env');
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_PATH)) {
    console.error('Input CSV not found:', INPUT_PATH);
    process.exit(1);
  }

  const agencies = uniqueAgencyNames(readCsv(INPUT_PATH));
  const state = loadState();
  const { batch, nextAgencyIndex } = buildAgencyBatch(agencies, state.nextAgencyIndex, limit);
  const existingUrls = loadExistingUrlSet();
  const rowsToAppend = [];

  console.log(`Loaded ${agencies.length} agencies. Processing ${batch.length} starting from index ${state.nextAgencyIndex}.`);

  for (const [offset, agencyName] of batch.entries()) {
    const queryIndex = (state.nextQueryIndex + offset) % QUERY_TEMPLATES.length;
    const query = QUERY_TEMPLATES[queryIndex].replace('{agency_name}', agencyName);
    console.log(`Searching ${offset + 1}/${batch.length}: ${query}`);

    const results = await braveSearch(braveApiKey, query);
    const AD_KEYWORDS = [
      'campaign', 'commercial', 'advertising', 'agency', 'ad agency', 'creative agency',
      'brand', 'spot', 'launch', 'adweek', 'adage', 'creative', 'marketing', 'lbbonline',
      'campaign brief', 'new work', 'client', 'reel', 'award', 'cannes', 'effie', 'clio'
    ];
    const signals = results
      .map((result) => normalizeSignal(agencyName, result))
      .filter((signal) => {
        if (!signal.url || existingUrls.has(signal.url)) return false;
        const text = `${signal.post_title} ${signal.snippet}`.toLowerCase();
        return AD_KEYWORDS.some((kw) => text.includes(kw));
      });

    for (const signal of signals) {
      existingUrls.add(signal.url);
      rowsToAppend.push(signal);
    }

    if (offset + 1 < batch.length) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  if (rowsToAppend.length > 0) {
    let csvOut = '';
    if (fs.existsSync(OUTPUT_PATH)) {
      csvOut = fs.readFileSync(OUTPUT_PATH, 'utf8').trimEnd();
      if (!csvOut.endsWith('\n')) csvOut += '\n';
      csvOut += stringify(rowsToAppend, { header: false });
    } else {
      csvOut = stringify(rowsToAppend, { header: true, columns: OUTPUT_COLUMNS });
    }
    fs.writeFileSync(OUTPUT_PATH, csvOut, 'utf8');
    console.log(`Appended ${rowsToAppend.length} signals to ${OUTPUT_PATH}`);
  } else {
    console.log('No new signals to append.');
  }

  const nextQueryIndex = (state.nextQueryIndex + batch.length) % QUERY_TEMPLATES.length;
  if (!noSaveState) {
    saveState(nextAgencyIndex, nextQueryIndex);
    console.log(`Saved state: nextAgencyIndex=${nextAgencyIndex}, nextQueryIndex=${nextQueryIndex}`);
  } else {
    console.log('Skipping state save (--no-save-state)');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
