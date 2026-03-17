#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const INPUT_PATH = path.join(ROOT_DIR, 'leads', 'studio-awesome-competitors.csv');
const OUTPUT_PATH = path.join(ROOT_DIR, 'leads', 'studio-awesome-competitor-credits.csv');

const REQUEST_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 1_000_000;
const PAGE_KEYWORDS = ['work', 'credits', 'clients', 'projects', 'portfolio', 'our work', 'reel'];
const NETWORK_NAMES = new Set([
  'abc', 'adult swim', 'amazon prime video', 'amc', 'apple tv+', 'bbc', 'bet', 'bravo', 'cartoon network',
  'cbs', 'channel 4', 'cnn', 'comedy central', 'cw', 'discovery', 'disney', 'disney+', 'espn', 'fx', 'fxx',
  'hbo', 'hgtv', 'history', 'hulu', 'ifc', 'max', 'msnbc', 'mtv', 'national geographic', 'nbc', 'netflix',
  'nfl network', 'nickelodeon', 'paramount+', 'pbs', 'peacock', 'prime video', 'showtime', 'sky', 'starz', 'syfy', 'tbs',
  'tcm', 'tlc', 'tnt', 'trutv', 'univision', 'usa network', 'vh1', 'youtube'
]);
const BRAND_SUFFIXES = ['Inc', 'LLC', 'Ltd', 'Co', 'Company', 'Corp', 'Corporation', 'Brands', 'Brand', 'Games'];
const KNOWN_BRANDS = new Set(['ea', 'lucasfilm', 'lucasfilm animation', 'playstation', 'prime']);
const PRODUCTION_SUFFIXES = [
  'Productions', 'Production', 'Studios', 'Studio', 'Pictures', 'Media', 'Entertainment', 'Films', 'Film',
  'Animation', 'Post', 'Sound', 'Audio', 'Creative', 'Content'
];
const COMPANY_TOKENS = new Set([
  'animation', 'audio', 'brand', 'brands', 'broadcasting', 'channel', 'company', 'content', 'creative', 'entertainment',
  'film', 'films', 'group', 'interactive', 'media', 'music', 'network', 'networks', 'pictures', 'post', 'productions',
  'records', 'sound', 'sports', 'station', 'streaming', 'studio', 'studios', 'television'
]);
const NOISE_PHRASES = new Set([
  'about', 'all projects', 'all work', 'book now', 'book today', 'case study', 'clients', 'contact', 'cookie policy',
  'credits', 'details', 'get in touch', 'go to top', 'home', 'learn more', 'menu', 'next project', 'our work',
  'portfolio', 'previous project', 'privacy policy', 'projects', 'read more', 'reel', 'services', 'skip to content',
  'terms of use', 'view project', 'work'
]);
const UI_PATTERNS = [
  /\b(read more|learn more|view project|case study|skip to content|go to top|next project|previous project)\b/i,
  /\b(menu|navigation|search|submit|close|open|toggle)\b/i,
  /\b(privacy|cookie|terms|copyright|newsletter|subscribe|follow us)\b/i
];
const PERSON_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);
const STAFF_TITLES = /\b(assistant|associate|ceo|coo|co-founder|cofounder|cto|coordinator|director|engineer|executive|founder|head|lead|manager|owner|partner|president|producer|supervisor|vice president|vp)\b/i;
const FACILITY_PATTERNS = [
  /\bstage\s+\d+\b/i,
  /\b(edit suite|suite \d+|theater|theatre|lobby|front desk|conference room|machine room|mix room)\b/i
];
const GEAR_PATTERNS = [
  /\b(dolby|atmos renderer|avid|pro tools|monitoring|projection|plugins|console|microphone|speakers?|gear|equipment|dimensions?)\b/i,
  /\b(5\.1|7\.1|stereo|hdr|4k|1080p)\b/i
];
const GENERIC_PATTERNS = [
  /\b(marketing|press inquiries|employment opportunities|leadership|culture|community engagement|website team|site by)\b/i,
  /\b(contact|email|phone|address)\b/i,
  /\b(media district|major competitor|award-winning adr|major adr|audio post facility|local post facility)\b/i
];

let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleRequests() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < REQUEST_DELAY_MS) {
    await sleep(REQUEST_DELAY_MS - elapsed);
  }
  lastRequestAt = Date.now();
}

function sanitizeCell(value) {
  return String(value || '').trim();
}

function loadCompetitors() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Input CSV not found: ${INPUT_PATH}`);
  }

  const raw = fs.readFileSync(INPUT_PATH, 'utf8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
}

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, '-')
    .replace(/&hellip;/gi, '...')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
  ).trim();
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return normalizeWhitespace(value)
    .replace(/[|/:]+$/g, '')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
    .toLowerCase();
}

function isLikelyHtml(contentType) {
  return !contentType || /text\/html|application\/xhtml\+xml/i.test(contentType);
}

function requestUrl(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, {
      headers: {
        'user-agent': 'mission-control-competitor-scraper/1.0',
        accept: 'text/html,application/xhtml+xml'
      }
    }, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location;

      if (status >= 300 && status < 400 && location) {
        res.resume();
        if (redirectCount >= MAX_REDIRECTS) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        const nextUrl = new URL(location, url).toString();
        resolve(requestUrl(nextUrl, redirectCount + 1));
        return;
      }

      if (status < 200 || status >= 300) {
        res.resume();
        const err = new Error(`HTTP ${status} for ${url}`);
        err.statusCode = status;
        reject(err);
        return;
      }

      const chunks = [];
      let totalBytes = 0;

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BODY_BYTES) {
          req.destroy(new Error(`Response too large for ${url}`));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          url,
          body: Buffer.concat(chunks).toString('utf8'),
          contentType: res.headers['content-type'] || ''
        });
      });
    });

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timeout after ${REQUEST_TIMEOUT_MS}ms for ${url}`));
    });

    req.on('error', reject);
  });
}

async function fetchHtml(url) {
  await throttleRequests();
  const response = await requestUrl(url);
  if (!isLikelyHtml(response.contentType)) {
    throw new Error(`Non-HTML content for ${url}`);
  }
  return response;
}

function extractLinks(html, baseUrl) {
  const links = [];
  const anchorRegex = /<a\b[^>]*href\s*=\s*(['"])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html))) {
    const href = normalizeWhitespace(decodeHtmlEntities(match[2]));
    const text = normalizeWhitespace(stripHtml(match[3]));
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      continue;
    }

    try {
      const absoluteUrl = new URL(href, baseUrl);
      links.push({
        url: absoluteUrl.toString(),
        text
      });
    } catch {
      continue;
    }
  }

  return links;
}

function matchesKeyword(value) {
  const lower = String(value || '').toLowerCase();
  return PAGE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function discoverCandidatePages(homeUrl, html) {
  const home = new URL(homeUrl);
  const candidates = new Set([homeUrl]);

  for (const link of extractLinks(html, homeUrl)) {
    const target = new URL(link.url);
    if (target.hostname !== home.hostname) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|mp4|mov|mp3|zip)$/i.test(target.pathname)) continue;

    const combined = `${link.text} ${target.pathname}`.toLowerCase();
    if (matchesKeyword(combined)) {
      candidates.add(target.toString());
    }
  }

  return Array.from(candidates).slice(0, 10);
}

function uniqueMatches(regex, text) {
  const found = [];
  const seen = new Set();
  let match;

  while ((match = regex.exec(text))) {
    const value = normalizeWhitespace(match[1] || match[0]);
    const key = normalizeName(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    found.push(value);
  }

  return found;
}

function extractCandidateStrings(html) {
  const candidates = [];
  const patterns = [
    /<(h[1-4]|title|strong|b)[^>]*>([\s\S]*?)<\/\1>/gi,
    /<(li|p|div|span)[^>]*>([\s\S]*?)<\/\1>/gi,
    /<(img)[^>]*\balt\s*=\s*(['"])(.*?)\2[^>]*>/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const raw = match[3] || match[2] || '';
      const text = normalizeWhitespace(stripHtml(raw));
      if (text) candidates.push(text);
    }
  }

  const ldJsonMatches = uniqueMatches(/"name"\s*:\s*"([^"]{2,120})"/gi, html);
  candidates.push(...ldJsonMatches);

  return candidates;
}

function splitCandidateText(text) {
  return text
    .split(/\s+[|/•·]\s+|(?<!\b(?:The|A))\s+-\s+|;\s+|:\s+(?=[A-Z][a-z])/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

function countWords(text) {
  return normalizeWhitespace(text).split(/\s+/).filter(Boolean).length;
}

function toWords(text) {
  return normalizeWhitespace(text)
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z0-9'&+.-]+|[^A-Za-z0-9'&+.-]+$/g, ''))
    .filter(Boolean);
}

function isNoise(text) {
  const normalized = normalizeName(text);
  if (!normalized) return true;
  if (NOISE_PHRASES.has(normalized)) return true;
  if (normalized.length < 3) return true;
  if (/^(www\.|http)/i.test(text)) return true;
  if (/^\d+$/.test(normalized)) return true;
  if (UI_PATTERNS.some((pattern) => pattern.test(text))) return true;
  return false;
}

function isLikelyPersonName(text) {
  const words = toWords(text);
  if (words.length < 2 || words.length > 3) return false;
  if (STAFF_TITLES.test(text)) return true;
  if (/[0-9@]/.test(text)) return false;

  const normalizedWords = words.map((word) => word.toLowerCase().replace(/\./g, ''));
  const filtered = normalizedWords.filter((word) => !PERSON_SUFFIXES.has(word));
  if (filtered.length < 2 || filtered.length > 3) return false;
  if (filtered.some((word) => COMPANY_TOKENS.has(word))) return false;

  const capitalized = words.every((word) => /^[A-Z][a-z'’-]+$/.test(word) || PERSON_SUFFIXES.has(word.toLowerCase().replace(/\./g, '')));
  return capitalized;
}

function looksLikeTitleCaseEntity(text) {
  const words = toWords(text);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((word, index) => {
    if (/^(a|an|and|as|at|by|for|from|in|of|on|or|the|to|with)$/i.test(word)) {
      return index > 0;
    }
    return /^[A-Z0-9][A-Za-z0-9'&+.:/-]*$/.test(word);
  });
}

function isLikelyCompanyName(text) {
  const lower = text.toLowerCase();
  if (KNOWN_BRANDS.has(lower)) return true;
  if (NETWORK_NAMES.has(lower)) return true;
  if (Array.from(NETWORK_NAMES).some((network) => lower.includes(network))) return true;
  if (BRAND_SUFFIXES.some((suffix) => new RegExp(`\\b${suffix}\\b`, 'i').test(text))) return true;
  if (PRODUCTION_SUFFIXES.some((suffix) => new RegExp(`\\b${suffix}\\b`, 'i').test(text))) return true;
  return toWords(text).some((word) => COMPANY_TOKENS.has(word.toLowerCase()));
}

function isAllowedEntity(text) {
  const normalized = normalizeWhitespace(text).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
  if (!normalized) return false;
  if (isNoise(normalized)) return false;
  if (countWords(normalized) === 1 && !isLikelyCompanyName(normalized)) return false;
  if (countWords(normalized) > 8) return false;
  if (isLikelyPersonName(normalized)) return false;
  if (FACILITY_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  if (GEAR_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  if (GENERIC_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(normalized)) return false;
  if (/[|<>]/.test(normalized)) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;
  return looksLikeTitleCaseEntity(normalized) || isLikelyCompanyName(normalized);
}

function classifyEntity(name) {
  const lower = name.toLowerCase();
  if (NETWORK_NAMES.has(lower)) return 'network';
  if (Array.from(NETWORK_NAMES).some((network) => lower.includes(network))) return 'network';
  if (KNOWN_BRANDS.has(lower)) return 'brand';
  if (PRODUCTION_SUFFIXES.some((suffix) => new RegExp(`\\b${suffix}\\b`, 'i').test(name))) {
    return 'production_company';
  }
  if (BRAND_SUFFIXES.some((suffix) => new RegExp(`\\b${suffix}\\b`, 'i').test(name))) {
    return 'brand';
  }
  if (toWords(name).some((word) => COMPANY_TOKENS.has(word.toLowerCase()))) {
    return 'production_company';
  }
  if (/^[A-Z0-9&+.' -]{2,}$/.test(name) && !/\s/.test(name)) return 'brand';
  return 'show';
}

function extractEntitiesFromHtml(html) {
  const entityMap = new Map();

  for (const rawCandidate of extractCandidateStrings(html)) {
    for (const segment of splitCandidateText(rawCandidate)) {
      const cleaned = normalizeWhitespace(
        segment
          .replace(/\b(featured work|selected work|our work|our clients|clients|credits|project|projects|portfolio|reel|case study|view project)\b/gi, '')
          .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
      );

      if (!cleaned) continue;
      if (!isAllowedEntity(cleaned)) continue;

      const normalized = normalizeName(cleaned);
      if (!normalized) continue;
      if (!entityMap.has(normalized)) {
        entityMap.set(normalized, {
          name: cleaned,
          type: classifyEntity(cleaned)
        });
      }
    }
  }

  return Array.from(entityMap.values());
}

function extractEntitiesFromText(text) {
  const entityMap = new Map();
  const fragments = [];
  const clientMatch = text.match(/\bclients?\s*:\s*([^.]*)/i);

  if (clientMatch) {
    fragments.push(...clientMatch[1].split(/\s*,\s*/));
  }

  const phraseMatches = text.match(/\b(?:[A-Z][A-Za-z0-9&+'-]*|[A-Z]{2,})(?:\s+(?:[A-Z][A-Za-z0-9&+'-]*|[A-Z]{2,}|of|and|the)){0,4}\b/g) || [];
  fragments.push(...phraseMatches);

  for (const fragment of fragments) {
    const cleaned = normalizeWhitespace(fragment).replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
    if (!cleaned || !isAllowedEntity(cleaned)) continue;

    const normalized = normalizeName(cleaned);
    if (!normalized || entityMap.has(normalized)) continue;
    entityMap.set(normalized, {
      name: cleaned,
      type: classifyEntity(cleaned)
    });
  }

  return Array.from(entityMap.values());
}

async function scrapeCompetitor(competitor) {
  const competitorName = sanitizeCell(competitor.name) || sanitizeCell(competitor.id) || 'unknown';
  const website = sanitizeCell(competitor.website);
  const notes = sanitizeCell(competitor.notes);

  if (!website) {
    console.warn(`[warn] ${competitorName}: missing website, skipping`);
    return [];
  }

  let homeResponse;
  try {
    homeResponse = await fetchHtml(website);
  } catch (err) {
    console.warn(`[warn] ${competitorName}: failed to fetch home page ${website} (${err.message})`);
    const scrapedAt = new Date().toISOString();
    return extractEntitiesFromText(notes).map((entity) => ({
      competitor_name: competitorName,
      client_or_project: entity.name,
      type: entity.type,
      source_url: website,
      scraped_at: scrapedAt
    }));
  }

  const pageUrls = discoverCandidatePages(homeResponse.url, homeResponse.body);
  const scrapedAt = new Date().toISOString();
  const results = [];
  const seenForCompetitor = new Set();
  let fetchedPageCount = 0;

  for (const pageUrl of pageUrls) {
    let page;
    try {
      page = pageUrl === homeResponse.url ? homeResponse : await fetchHtml(pageUrl);
    } catch (err) {
      console.warn(`[warn] ${competitorName}: failed to fetch ${pageUrl} (${err.message})`);
      continue;
    }

    fetchedPageCount += 1;
    const entities = extractEntitiesFromHtml(page.body);
    for (const entity of entities) {
      const dedupeKey = normalizeName(entity.name);
      if (!dedupeKey || seenForCompetitor.has(dedupeKey)) continue;
      seenForCompetitor.add(dedupeKey);
      results.push({
        competitor_name: competitorName,
        client_or_project: entity.name,
        type: entity.type,
        source_url: page.url,
        scraped_at: scrapedAt
      });
    }
  }

  if (results.length === 0 && notes) {
    const fallbackEntities = extractEntitiesFromText(notes);
    for (const entity of fallbackEntities) {
      const dedupeKey = normalizeName(entity.name);
      if (!dedupeKey || seenForCompetitor.has(dedupeKey)) continue;
      seenForCompetitor.add(dedupeKey);
      results.push({
        competitor_name: competitorName,
        client_or_project: entity.name,
        type: entity.type,
        source_url: website,
        scraped_at: scrapedAt
      });
    }
  }

  console.log(`[info] ${competitorName}: found ${results.length} unique items across ${fetchedPageCount} fetched pages`);
  return results;
}

function dedupeResults(records) {
  const deduped = [];
  const seen = new Set();

  for (const record of records) {
    const key = `${normalizeName(record.competitor_name)}::${normalizeName(record.client_or_project)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}

function writeResults(records) {
  const columns = ['competitor_name', 'client_or_project', 'type', 'source_url', 'scraped_at'];
  const csv = stringify(records, { header: true, columns });
  fs.writeFileSync(OUTPUT_PATH, csv, 'utf8');
}

async function main() {
  const competitors = loadCompetitors();
  const allResults = [];

  console.log(`Loaded ${competitors.length} competitors from ${INPUT_PATH}`);

  for (const competitor of competitors) {
    const records = await scrapeCompetitor(competitor);
    allResults.push(...records);
  }

  const deduped = dedupeResults(allResults);
  writeResults(deduped);

  console.log(`Wrote ${deduped.length} rows to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
