#!/usr/bin/env node

// Run after each pipeline to sync new leads to Google Sheets

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { google } = require('googleapis');

const ROOT_DIR = process.cwd();
const LEADS_DIR = path.join(ROOT_DIR, 'leads');
const ENV_PATH = path.join(ROOT_DIR, '.env.local');
const APPROVED_EXPORT_PATH = path.join(LEADS_DIR, 'sheets-approved-export.csv');

const STATUS_PENDING = 'Pending';
const STATUS_APPROVED = 'Approved';
const STATUS_REJECTED = 'Rejected';
const STATUS_CLIENT = 'Client';
const STATUS_PAST_CLIENT = 'Past Client';

const SHEET_TABS = [
  {
    title: 'SC + SA - Small Mid Agencies',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['select-small-mid-agencies-us.csv']
  },
  {
    title: 'SC + SA - Brands & Agencies',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['studio-agencies.csv', 'studio-brands.csv']
  },
  {
    title: 'SC + SA - Agency Producers',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['agency-production-contacts.csv']
  },
  {
    title: 'SC + SA - New Producers',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['new-producers-contacts.csv']
  },
  {
    title: 'SC + SA - Social Signals',
    type: 'social',
    headers: ['status', 'agency_name', 'post_title', 'snippet', 'url', 'published_date', 'signal_type'],
    files: ['social-campaign-signals.csv']
  },
  {
    title: 'SA - Local Leads',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['studio-awesome-local-leads.csv']
  },
  {
    title: 'SC - Agency Contacts (All Markets)',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['all-agency-contacts.csv']
  },
  {
    title: 'SC - SF Agencies',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['sf-agencies.csv']
  },
  {
    title: 'SC - Active Clients',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['sc-active-clients-sheet.csv']
  },
  {
    title: 'SC - Recording Studios',
    type: 'lead',
    headers: ['status', 'first_name', 'last_name', 'company_name', 'title', 'website', 'email', 'city', 'notes', 'added_date', 'source'],
    files: ['sc-recording-studios.csv']
  },
  {
    title: 'SA - Email Contacts',
    type: 'email_contacts',
    headers: ['status', 'name', 'email', 'company_guess', 'company_domain', 'refined_industry', 'industry_segment', 'mailbox_owner', 'message_count', 'adr_related', 'adr_message_count', 'last_seen', 'mv_result', 'mv_quality', 'relationship_type_mike', 'relationship_confidence_mike', 'relationship_type_josiah', 'relationship_confidence_josiah', 'linkedin_url'],
    files: ['studioawesome-email-contacts.csv']
  }
];

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

function parseCsvFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
}

function ensureCsvFile(filePath, headerRow) {
  if (fs.existsSync(filePath)) return;
  fs.writeFileSync(filePath, `${headerRow}\n`, 'utf8');
}

function normalizeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'approved') return STATUS_APPROVED;
  if (normalized === 'rejected') return STATUS_REJECTED;
  if (normalized === 'client') return STATUS_CLIENT;
  if (normalized === 'past client') return STATUS_PAST_CLIENT;
  return STATUS_PENDING;
}

function splitName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' ')
  };
}

function toDateString(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return date.toISOString().slice(0, 10);
}

function currentDateString() {
  return new Date().toISOString().slice(0, 10);
}

function extractCityFromAddress(address) {
  const trimmed = String(address || '').trim();
  if (!trimmed) return '';
  const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return `${parts[1]}, ${parts[2].split(/\s+/).slice(0, 2).join(' ')}`.trim();
  return trimmed;
}

function statusColor(status) {
  if (status === STATUS_APPROVED) {
    return { red: 183 / 255, green: 225 / 255, blue: 205 / 255 }; // light green
  }
  if (status === STATUS_REJECTED) {
    return { red: 244 / 255, green: 199 / 255, blue: 195 / 255 }; // light red
  }
  if (status === STATUS_CLIENT) {
    return { red: 197 / 255, green: 222 / 255, blue: 255 / 255 }; // light blue
  }
  if (status === STATUS_PAST_CLIENT) {
    return { red: 220 / 255, green: 204 / 255, blue: 255 / 255 }; // light purple
  }
  // Pending — light yellow
  return { red: 255 / 255, green: 243 / 255, blue: 199 / 255 };
}

function buildMatchKey(row) {
  const email = String(row.email || '').trim().toLowerCase();
  const url = String(row.url || row.website || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  if (url) return `url:${url}`;

  const fallback = [
    String(row.company_name || row.agency_name || '').trim().toLowerCase(),
    String(row.first_name || row.post_title || '').trim().toLowerCase(),
    String(row.last_name || '').trim().toLowerCase(),
    String(row.city || '').trim().toLowerCase()
  ].join('|');
  return `fallback:${fallback}`;
}

function dedupeRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = buildMatchKey(row);
    byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

function normalizeLeadRow(sourceFile, record) {
  const source = String(record.source || sourceFile.replace(/\.csv$/, '')).trim();
  const email = String(record.email || record.contact_email || '').trim();
  const website = String(record.website || '').trim();
  const companyName = String(record.company_name || record.company || record.name || '').trim();
  const notes = String(record.notes || '').trim();

  if (sourceFile === 'all-agency-contacts.csv' || sourceFile === 'sf-agencies.csv' || sourceFile === 'sc-active-clients-sheet.csv' || sourceFile === 'sc-recording-studios.csv') {
    return {
      status: STATUS_PENDING,
      first_name: String(record.first_name || '').trim(),
      last_name: String(record.last_name || '').trim(),
      email,
      company_name: companyName,
      title: String(record.title || '').trim(),
      city: String(record.city || '').trim(),
      website,
      notes,
      source,
      added_date: String(record.added_date || '').trim()
    };
  }

  if (sourceFile === 'agency-production-contacts.csv') {
    return {
      status: STATUS_PENDING,
      first_name: String(record.first_name || '').trim(),
      last_name: String(record.last_name || '').trim(),
      email,
      company_name: companyName,
      title: String(record.title || '').trim(),
      city: String(record.city || '').trim(),
      website,
      notes,
      source,
      added_date: ''
    };
  }

  if (sourceFile === 'studio-awesome-local-leads.csv') {
    const contact = splitName(record.contact_name);
    return {
      status: STATUS_PENDING,
      first_name: contact.firstName,
      last_name: contact.lastName,
      email,
      company_name: companyName,
      title: '',
      city: extractCityFromAddress(record.address),
      website,
      notes,
      source: source || 'local-leads',
      added_date: toDateString(record.addedAt)
    };
  }

  const contactName = String(record.contact_name || '').trim();
  const baseName = contactName || String(record.name || '').trim();
  const split = splitName(baseName);

  return {
    status: STATUS_PENDING,
    first_name: split.firstName,
    last_name: split.lastName,
    email,
    company_name: companyName,
    title: '',
    city: String(record.city || '').trim(),
    website,
    notes,
    source,
    added_date: ''
  };
}

function normalizeSocialRow(sourceFile, record) {
  return {
    status: STATUS_PENDING,
    agency_name: String(record.agency_name || '').trim(),
    post_title: String(record.post_title || '').trim(),
    snippet: String(record.snippet || '').trim(),
    url: String(record.url || '').trim(),
    published_date: toDateString(record.published_date),
    signal_type: String(record.signal_type || sourceFile.replace(/\.csv$/, '')).trim()
  };
}

function normalizeEmailContactRow(record) {
  const name = String(record.name || '').trim();
  const email = String(record.email || '').trim().toLowerCase();
  if (!email || email.includes('mailer-daemon') || email.includes('noreply')) return null;
  return {
    status: STATUS_PENDING,
    name,
    email,
    company_guess: String(record.company_guess || '').trim(),
    company_domain: String(record.company_domain || '').trim(),
    refined_industry: String(record.refined_industry || record.industry_segment || '').trim(),
    mailbox_owner: String(record.mailbox_owner || '').trim(),
    message_count: String(record.message_count || '').trim(),
    adr_related: String(record.adr_related || '').trim(),
    adr_message_count: String(record.adr_message_count || '').trim(),
    first_seen: toDateString(record.first_seen),
    last_seen: toDateString(record.last_seen),
    mv_result: String(record.mv_result || '').trim(),
    mv_quality: String(record.mv_quality || '').trim(),
    relationship_type_mike: String(record.relationship_type_mike || '').trim(),
    relationship_confidence_mike: String(record.relationship_confidence_mike || '').trim(),
    relationship_type_josiah: String(record.relationship_type_josiah || '').trim(),
    relationship_confidence_josiah: String(record.relationship_confidence_josiah || '').trim()
  };
}

function loadSourceRows(tab) {
  const rows = [];
  for (const file of tab.files) {
    const filePath = path.join(LEADS_DIR, file);
    if (file === 'new-producers-contacts.csv') {
      ensureCsvFile(filePath, 'name,company,city,type,source,website,contact_name,contact_email,linkedin_url,notes');
    }

    const records = parseCsvFile(filePath);
    for (const record of records) {
      if (tab.type === 'email_contacts') {
        const row = normalizeEmailContactRow(record);
        if (row) rows.push(row);
      } else {
        rows.push(tab.type === 'social' ? normalizeSocialRow(file, record) : normalizeLeadRow(file, record));
      }
    }
  }
  return dedupeRows(rows);
}

function rowsToObjects(headers, values) {
  return values
    .filter((row) => row.some((cell) => String(cell || '').trim() !== ''))
    .map((row) => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = String(row[index] || '').trim();
      });
      return obj;
    });
}

function mergeRows(tab, sourceRows, sheetRows) {
  const existingByKey = new Map();
  for (const row of sheetRows) {
    existingByKey.set(buildMatchKey(row), row);
  }

  return sourceRows.map((sourceRow) => {
    const existing = existingByKey.get(buildMatchKey(sourceRow));
    const status = existing ? normalizeStatus(existing.status) : STATUS_PENDING;
    const addedDate = String(
      (existing && existing.added_date) ||
      sourceRow.added_date ||
      currentDateString()
    ).trim();

    if (tab.type === 'social') {
      return {
        status,
        agency_name: sourceRow.agency_name,
        post_title: sourceRow.post_title,
        snippet: sourceRow.snippet,
        url: sourceRow.url,
        published_date: sourceRow.published_date,
        signal_type: sourceRow.signal_type
      };
    }

    if (tab.type === 'email_contacts') {
      return {
        status,
        name: sourceRow.name,
        email: sourceRow.email,
        company_guess: sourceRow.company_guess,
        company_domain: sourceRow.company_domain,
        refined_industry: sourceRow.refined_industry,
        mailbox_owner: sourceRow.mailbox_owner,
        message_count: sourceRow.message_count,
        adr_related: sourceRow.adr_related,
        adr_message_count: sourceRow.adr_message_count,
        first_seen: sourceRow.first_seen,
        last_seen: sourceRow.last_seen,
        mv_result: sourceRow.mv_result,
        mv_quality: sourceRow.mv_quality,
        relationship_type_mike: sourceRow.relationship_type_mike,
        relationship_confidence_mike: sourceRow.relationship_confidence_mike,
        relationship_type_josiah: sourceRow.relationship_type_josiah,
        relationship_confidence_josiah: sourceRow.relationship_confidence_josiah
      };
    }

    return {
      status,
      first_name: sourceRow.first_name,
      last_name: sourceRow.last_name,
      email: sourceRow.email,
      company_name: sourceRow.company_name,
      title: sourceRow.title,
      city: sourceRow.city,
      website: sourceRow.website,
      notes: sourceRow.notes,
      source: sourceRow.source,
      added_date: addedDate
    };
  });
}

function objectsToValues(headers, rows) {
  return [headers, ...rows.map((row) => headers.map((header) => row[header] || ''))];
}

async function getSheetsClient(credentialsPath) {
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
}

async function ensureTabs(sheets, spreadsheetId) {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = new Map(
    (spreadsheet.data.sheets || []).map((sheet) => [
      sheet.properties.title,
      { sheetId: sheet.properties.sheetId, title: sheet.properties.title }
    ])
  );

  const missing = SHEET_TABS.filter((tab) => !existing.has(tab.title));
  if (missing.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: missing.map((tab) => ({
          addSheet: {
            properties: {
              title: tab.title,
              gridProperties: { frozenRowCount: 1 }
            }
          }
        }))
      }
    });
  }

  const refreshed = await sheets.spreadsheets.get({ spreadsheetId });
  const tabsByTitle = new Map();
  for (const sheet of refreshed.data.sheets || []) {
    tabsByTitle.set(sheet.properties.title, {
      sheetId: sheet.properties.sheetId,
      title: sheet.properties.title
    });
  }
  return tabsByTitle;
}

async function readSheetRows(sheets, spreadsheetId, tab) {
  const range = `'${tab.title}'!A:Z`;
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = response.data.values || [];
  if (values.length <= 1) return [];
  return rowsToObjects(tab.headers, values.slice(1));
}

async function writeSheetRows(sheets, spreadsheetId, tab, sheetId, rows) {
  const values = objectsToValues(tab.headers, rows);
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${tab.title}'!A:Z`
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tab.title}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values }
  });

  const requests = [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1 }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true }
          }
        },
        fields: 'userEnteredFormat.textFormat.bold'
      }
    }
  ];

  if (rows.length > 0) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: rows.length + 1
        },
        cell: {
          userEnteredFormat: {
            backgroundColorStyle: {
              rgbColor: { red: 1, green: 1, blue: 1 }
            }
          }
        },
        fields: 'userEnteredFormat.backgroundColorStyle'
      }
    });
  }

  rows.forEach((row, index) => {
    const color = statusColor(normalizeStatus(row.status));
    if (!color) return;
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: index + 1,
          endRowIndex: index + 2
        },
        cell: {
          userEnteredFormat: {
            backgroundColorStyle: {
              rgbColor: color
            }
          }
        },
        fields: 'userEnteredFormat.backgroundColorStyle'
      }
    });
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests }
  });
}

function buildApprovedExport(allLeadRows) {
  return allLeadRows
    .filter((row) => normalizeStatus(row.status) === STATUS_APPROVED)
    .filter((row) => String(row.email || '').trim() !== '')
    .map((row) => ({
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      email: row.email || '',
      company_name: row.company_name || '',
      title: row.title || '',
      city: row.city || '',
      website: row.website || '',
      notes: row.notes || '',
      source: row.source || '',
      added_date: row.added_date || ''
    }));
}

function writeApprovedExport(rows) {
  const csv = stringify(rows, {
    header: true,
    columns: ['first_name', 'last_name', 'email', 'company_name', 'title', 'city', 'website', 'notes', 'source', 'added_date']
  });
  fs.writeFileSync(APPROVED_EXPORT_PATH, csv, 'utf8');
}

async function main() {
  const env = loadEnv();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID || env.GOOGLE_SHEET_ID;
  const credentialsPath = path.resolve(
    ROOT_DIR,
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH || env.GOOGLE_SERVICE_ACCOUNT_PATH || './credentials/google-service-account.json'
  );

  if (!spreadsheetId) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env.local');
  }
  if (!fs.existsSync(credentialsPath)) {
    throw new Error(`Google service account file not found: ${credentialsPath}`);
  }

  const sheets = await getSheetsClient(credentialsPath);
  const tabsByTitle = await ensureTabs(sheets, spreadsheetId);

  const allLeadRows = [];

  for (const tab of SHEET_TABS) {
    const sourceRows = loadSourceRows(tab);
    const existingRows = await readSheetRows(sheets, spreadsheetId, tab);
    const mergedRows = mergeRows(tab, sourceRows, existingRows);
    const sheet = tabsByTitle.get(tab.title);
    if (!sheet) {
      throw new Error(`Sheet not found after creation: ${tab.title}`);
    }
    await writeSheetRows(sheets, spreadsheetId, tab, sheet.sheetId, mergedRows);
    if (tab.type === 'lead') {
      allLeadRows.push(...mergedRows);
    }
    console.log(`${tab.title}: synced ${mergedRows.length} rows`);
  }

  const approvedExportRows = buildApprovedExport(allLeadRows);
  writeApprovedExport(approvedExportRows);
  console.log(`Approved export: ${approvedExportRows.length} rows → ${path.relative(ROOT_DIR, APPROVED_EXPORT_PATH)}`);
}

main().catch((error) => {
  console.error(`Sync failed: ${error.message}`);
  process.exit(1);
});
