#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT_DIR = process.cwd();
const INPUT_PATH = path.join(ROOT_DIR, 'leads', 'studio-awesome-competitors.csv');
const OUTPUT_PATH = path.join(ROOT_DIR, 'leads', 'studio-awesome-competitor-services.csv');

const REQUEST_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 1_000_000;
const PAGE_KEYWORDS = ['services', 'service', 'about', 'capabilities', 'what we do', 'expertise', 'post'];
const SERVICE_MAP = [
  { name: 'ADR', patterns: [/\badr\b/i, /\bautomated dialogue replacement\b/i, /\bdialogue replacement\b/i] },
  { name: 'Dialogue Editing', patterns: [/\bdialog(?:ue)? editing\b/i, /\bdialog(?:ue)? editorial\b/i, /\baudio editorial\b/i] },
  { name: 'Foley', patterns: [/\bfoley\b/i] },
  { name: 'Mix', patterns: [/\bre-recording mix(?:ing)?\b/i, /\bmix(?:ing)?\b/i, /\bfinal mix\b/i] },
  { name: 'Dolby Atmos', patterns: [/\bdolby atmos\b/i, /\batmos mix(?:ing)?\b/i, /\batmos\b/i] },
  { name: 'VO Recording', patterns: [/\bvoice[\s-]?over\b/i, /\bvo recording\b/i, /\bvoice recording\b/i] },
  { name: 'Animation Dialogue', patterns: [/\banimation dialogue\b/i, /\banimation recording\b/i] },
  { name: 'Sound Design', patterns: [/\bsound design\b/i, /\bsound designer\b/i] },
  { name: 'Audio Post', patterns: [/\baudio post\b/i, /\bpost production\b/i, /\bpost-production\b/i, /\bpost sound\b/i] },
  { name: 'Music Recording', patterns: [/\bmusic recording\b/i, /\bscore recording\b/i, /\borchestra recording\b/i] },
  { name: 'Podcast', patterns: [/\bpodcast(?:ing)?\b/i] },
  { name: 'Localization', patterns: [/\blocali[sz]ation\b/i, /\bdubbing\b/i] },
  { name: 'Remote Recording', patterns: [/\bremote recording\b/i, /\bsource-connect\b/i, /\bipdtl\b/i] }
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

function discoverCandidatePages(homeUrl, html) {
  const home = new URL(homeUrl);
  const candidates = new Set([homeUrl]);

  for (const link of extractLinks(html, homeUrl)) {
    const target = new URL(link.url);
    if (target.hostname !== home.hostname) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|mp4|mov|mp3|zip)$/i.test(target.pathname)) continue;

    const combined = `${link.text} ${target.pathname}`.toLowerCase();
    if (PAGE_KEYWORDS.some((keyword) => combined.includes(keyword))) {
      candidates.add(target.toString());
    }
  }

  return Array.from(candidates).slice(0, 6);
}

function extractServices(text) {
  const found = [];

  for (const service of SERVICE_MAP) {
    if (service.patterns.some((pattern) => pattern.test(text))) {
      found.push(service.name);
    }
  }

  return found;
}

async function scrapeCompetitor(competitor) {
  const competitorName = sanitizeCell(competitor.name) || sanitizeCell(competitor.id) || 'unknown';
  const website = sanitizeCell(competitor.website);
  const notes = sanitizeCell(competitor.notes);

  if (!website) {
    console.warn(`[warn] ${competitorName}: missing website, skipping`);
    return null;
  }

  let homeResponse;
  try {
    homeResponse = await fetchHtml(website);
  } catch (err) {
    console.warn(`[warn] ${competitorName}: failed to fetch home page ${website} (${err.message})`);
    const services = extractServices(notes).sort();
    return {
      competitor_name: competitorName,
      services: services.join('; '),
      source_url: website,
      scraped_at: new Date().toISOString()
    };
  }

  const pageUrls = discoverCandidatePages(homeResponse.url, homeResponse.body);
  const serviceToSource = new Map();
  const scrapedAt = new Date().toISOString();
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
    const text = normalizeWhitespace(stripHtml(page.body));
    for (const service of extractServices(text)) {
      if (!serviceToSource.has(service)) {
        serviceToSource.set(service, page.url);
      }
    }
  }

  if (serviceToSource.size === 0 && notes) {
    for (const service of extractServices(notes)) {
      if (!serviceToSource.has(service)) {
        serviceToSource.set(service, website);
      }
    }
  }

  const services = Array.from(serviceToSource.keys()).sort();
  console.log(`[info] ${competitorName}: found ${services.length} services across ${fetchedPageCount} fetched pages`);

  return {
    competitor_name: competitorName,
    services: services.join('; '),
    source_url: Array.from(new Set(serviceToSource.values())).join(' | '),
    scraped_at: scrapedAt
  };
}

function writeResults(records) {
  const columns = ['competitor_name', 'services', 'source_url', 'scraped_at'];
  const csv = stringify(records, { header: true, columns });
  fs.writeFileSync(OUTPUT_PATH, csv, 'utf8');
}

async function main() {
  const competitors = loadCompetitors();
  const records = [];

  console.log(`Loaded ${competitors.length} competitors from ${INPUT_PATH}`);

  for (const competitor of competitors) {
    const record = await scrapeCompetitor(competitor);
    if (record) records.push(record);
  }

  writeResults(records);
  console.log(`Wrote ${records.length} rows to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
