#!/usr/bin/env node
// Verify unverified SA email contacts via MillionVerifier
// Reads studioawesome_contacts_refined_josiah_mike_verified.csv
// Runs MV on rows where mv_result is blank
// Writes updated file back + rebuilds the merged outreach CSV

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = process.cwd();
const ENV_PATH = path.join(ROOT, '.env.local');
const WORKSPACE = '/Users/henry/.openclaw/workspace';
const LEADS_DIR = path.join(ROOT, 'leads');

// Load env
const env = {};
fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).forEach(line => {
  const idx = line.indexOf('=');
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
});

const MV_API_KEY = env.MV_API_KEY;
const MV_API_URL = env.MV_API_URL || 'https://api.millionverifier.com/api';

function parseCSV(fp) {
  const lines = fs.readFileSync(fp, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  return { headers, rows: lines.slice(1).map(line => {
    const vals = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
      else cur += ch;
    }
    vals.push(cur);
    const obj = {}; headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
    return obj;
  })};
}

function writeCSV(fp, headers, rows) {
  const escape = v => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h] || '')).join(','))];
  fs.writeFileSync(fp, lines.join('\n'));
}

function mvVerify(email) {
  return new Promise((resolve) => {
    const url = `${MV_API_URL}/v3/?api=${MV_API_KEY}&email=${encodeURIComponent(email)}`;
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve({ result: j.result || 'unknown', quality: j.quality || '', subresult: j.subresult || '' });
        } catch { resolve({ result: 'unknown', quality: '', subresult: '' }); }
      });
    }).on('error', () => resolve({ result: 'unknown', quality: '', subresult: '' }));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const fullPath = path.join(WORKSPACE, 'studioawesome_contacts_refined_josiah_mike_verified.csv');
  const { headers, rows } = parseCSV(fullPath);

  // Ensure mv columns exist
  const mvCols = ['mv_result', 'mv_quality', 'mv_subresult'];
  for (const c of mvCols) { if (!headers.includes(c)) headers.push(c); }

  // Find unverified rows
  const toVerify = rows.filter(r => !r.mv_result || r.mv_result.trim() === '');
  console.log(`Total rows: ${rows.length}`);
  console.log(`Unverified: ${toVerify.length}`);
  console.log(`Already verified: ${rows.length - toVerify.length}`);

  if (toVerify.length === 0) {
    console.log('Nothing to verify.');
    return;
  }

  let done = 0, newOk = 0, newCatchall = 0, newInvalid = 0;

  for (const row of toVerify) {
    if (!row.email || row.email.includes('mailer-daemon') || row.email.includes('noreply')) {
      row.mv_result = 'invalid';
      row.mv_quality = '';
      row.mv_subresult = 'skipped';
      done++;
      continue;
    }

    const result = await mvVerify(row.email);
    row.mv_result = result.result;
    row.mv_quality = result.quality;
    row.mv_subresult = result.subresult;

    if (result.result === 'ok') newOk++;
    else if (result.result === 'catch_all') newCatchall++;
    else if (result.result === 'invalid') newInvalid++;

    done++;
    if (done % 50 === 0) {
      console.log(`Progress: ${done}/${toVerify.length} — ok:${newOk} catch_all:${newCatchall} invalid:${newInvalid}`);
      writeCSV(fullPath, headers, rows); // checkpoint save
    }
    await sleep(120); // rate limit friendly
  }

  // Final save of full verified file
  writeCSV(fullPath, headers, rows);
  console.log(`\nDone. New results — ok:${newOk} catch_all:${newCatchall} invalid:${newInvalid}`);

  // Now rebuild the merged outreach CSV
  console.log('\nRebuilding merged outreach CSV...');
  const cleanPath = path.join(WORKSPACE, 'studioawesome_contacts_outreach_view.csv');
  const { headers: cleanHeaders, rows: cleanRows } = parseCSV(cleanPath);
  const vIdx = new Map();
  for (const r of rows) { if (r.email) vIdx.set(r.email.toLowerCase().trim(), r); }

  const enriched = cleanRows.map(row => {
    const v = vIdx.get(row.email.toLowerCase().trim()) || {};
    return {
      ...row,
      mailbox_owner: v.mailbox_owner || '',
      mv_result: v.mv_result || '',
      mv_quality: v.mv_quality || '',
      relationship_type_mike: v.relationship_type_mike || '',
      relationship_confidence_mike: v.relationship_confidence_mike || '',
      relationship_type_josiah: v.relationship_type_josiah || '',
      relationship_confidence_josiah: v.relationship_confidence_josiah || '',
      adr_message_count: v.adr_message_count || ''
    };
  });

  const mergedHeaders = [...new Set([...cleanHeaders, 'mailbox_owner', 'mv_result', 'mv_quality', 'relationship_type_mike', 'relationship_confidence_mike', 'relationship_type_josiah', 'relationship_confidence_josiah', 'adr_message_count'])];
  const outPath = path.join(LEADS_DIR, 'studioawesome-email-contacts.csv');
  writeCSV(outPath, mergedHeaders, enriched);

  // Also write an ADR-only verified file for campaign use
  const adrOk = rows.filter(r =>
    (r.adr_related === 'TRUE' || r.adr_related === 'true') &&
    (r.mv_result === 'ok' || r.mv_result === 'catch_all')
  );
  const adrPath = path.join(LEADS_DIR, 'studioawesome-adr-campaign.csv');
  writeCSV(adrPath, headers, adrOk);
  console.log(`ADR campaign list: ${adrOk.length} contacts → ${adrPath}`);

  // Summary
  const allOk = rows.filter(r => r.mv_result === 'ok').length;
  const allCatchall = rows.filter(r => r.mv_result === 'catch_all').length;
  const allAdrOk = rows.filter(r => (r.adr_related === 'TRUE' || r.adr_related === 'true') && r.mv_result === 'ok').length;
  console.log(`\nFinal totals — ok:${allOk} catch_all:${allCatchall}`);
  console.log(`ADR contacts with ok emails: ${allAdrOk}`);
}

main().catch(console.error);
