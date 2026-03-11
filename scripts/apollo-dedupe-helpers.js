const fs = require('node:fs');
const { parse } = require('csv-parse/sync');

function normalizeValue(value) {
  return String(value || '').trim().toLowerCase();
}

function getEmailKey(row) {
  const email = normalizeValue(row?.contact_email);
  return email || null;
}

function getCompanyCityKey(row) {
  const company = normalizeValue(row?.company);
  const city = normalizeValue(row?.city);
  if (!company || !city) return null;
  return `${company}::${city}`;
}

function createLeadIndex(rows = []) {
  const emails = new Set();
  const companyCities = new Set();

  for (const row of rows) {
    const emailKey = getEmailKey(row);
    const companyCityKey = getCompanyCityKey(row);
    if (emailKey) emails.add(emailKey);
    if (companyCityKey) companyCities.add(companyCityKey);
  }

  return { emails, companyCities };
}

function loadLeadIndexFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) {
    return createLeadIndex();
  }

  const raw = fs.readFileSync(csvPath, 'utf8').trim();
  if (!raw) {
    return createLeadIndex();
  }

  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });

  return createLeadIndex(records);
}

function isDuplicateLead(row, leadIndex) {
  const emailKey = getEmailKey(row);
  const companyCityKey = getCompanyCityKey(row);

  return (
    (emailKey && leadIndex.emails.has(emailKey)) ||
    (companyCityKey && leadIndex.companyCities.has(companyCityKey))
  );
}

function addLeadToIndex(row, leadIndex) {
  const emailKey = getEmailKey(row);
  const companyCityKey = getCompanyCityKey(row);

  if (emailKey) leadIndex.emails.add(emailKey);
  if (companyCityKey) leadIndex.companyCities.add(companyCityKey);
}

module.exports = {
  addLeadToIndex,
  getCompanyCityKey,
  getEmailKey,
  isDuplicateLead,
  loadLeadIndexFromCsv
};
