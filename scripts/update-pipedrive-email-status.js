// Update Pipedrive contacts with Email Status, Best Email, Email Verified Date
// Based on MV verification results

const https = require('https');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const API_KEY = process.env.PIPEDRIVE_API_KEY || 'aa975d4352a516af8813c1b02fd4c1b7633b4436';
const BASE = 'https://api.pipedrive.com/v1';

// Custom field keys (from API)
const FIELD_EMAIL_STATUS = '36ddb587297dc9bf3ac5d669f89bafd24aa90f7b';
const FIELD_BEST_EMAIL   = '8d7c549cfd8992d401c52948eb26d695c054e036';
const FIELD_VERIFIED_DATE = 'a1e55f5e61327ab4b456dcb70f22b5db8f8aa8ab';

// Email Status enum options — need to fetch IDs
async function getEnumOptions() {
  return new Promise(resolve => {
    https.get(`${BASE}/personFields?api_token=${API_KEY}`, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const fields = JSON.parse(d).data || [];
        const statusField = fields.find(f => f.key === FIELD_EMAIL_STATUS);
        const options = {};
        (statusField?.options || []).forEach(opt => {
          options[opt.label] = opt.id;
        });
        console.log('Status options:', options);
        resolve(options);
      });
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchPerson(email) {
  return new Promise(resolve => {
    const url = `${BASE}/persons/search?term=${encodeURIComponent(email)}&field=email&exact_match=true&api_token=${API_KEY}`;
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(d);
          const items = result?.data?.items || [];
          resolve(items[0]?.item?.id || null);
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

async function updatePerson(personId, data) {
  return new Promise(resolve => {
    const body = JSON.stringify(data);
    const req = https.request({
      hostname: 'api.pipedrive.com',
      path: `/v1/persons/${personId}?api_token=${API_KEY}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d).success || false);
        } catch(e) { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function main() {
  // Load MV results
  const mvData = parse(fs.readFileSync('leads/pipedrive-contacts-ok.csv', 'utf8'), { columns: true });
  const reviewData = parse(fs.readFileSync('leads/pipedrive-contacts-review.csv', 'utf8'), { columns: true });
  const allContacts = [...mvData, ...reviewData];

  // Load email update recommendations
  let emailUpdates = {};
  try {
    const updates = parse(fs.readFileSync('leads/pipedrive-email-update-import.csv', 'utf8'), { columns: true });
    updates.forEach(r => {
      emailUpdates[r['Current Pipedrive Email'].toLowerCase()] = r['Recommended Email (SelectVO)'];
    });
    console.log(`Loaded ${Object.keys(emailUpdates).length} email update recommendations`);
  } catch(e) {
    console.log('No email updates file found, skipping');
  }

  // Get enum options for Email Status
  const statusOptions = await getEnumOptions();
  
  const today = new Date().toISOString().split('T')[0];
  const CHECKPOINT = 'leads/pipedrive-update-progress.json';
  let progress = fs.existsSync(CHECKPOINT) ? JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')) : {};

  let updated = 0, notFound = 0, failed = 0;

  for (const contact of allContacts) {
    const email = contact.email?.toLowerCase().trim();
    if (!email || progress[email]) continue;

    // Determine status label
    const mvResult = contact.mv_result || '';
    let statusLabel = 'Unknown';
    if (mvResult === 'ok') statusLabel = 'Verified';
    else if (mvResult === 'catch_all') statusLabel = 'Catch-All';
    else if (mvResult === 'invalid') statusLabel = 'Invalid';

    const statusId = statusOptions[statusLabel];
    const bestEmail = emailUpdates[email] || '';

    // Find person in Pipedrive
    const personId = await searchPerson(email);
    
    if (!personId) {
      notFound++;
      progress[email] = 'not_found';
      if (notFound % 20 === 0) {
        fs.writeFileSync(CHECKPOINT, JSON.stringify(progress));
        console.log(`Progress: ${updated} updated, ${notFound} not found, ${failed} failed`);
      }
      await sleep(200);
      continue;
    }

    // Build update payload
    const payload = {
      [FIELD_VERIFIED_DATE]: today
    };
    if (statusId) payload[FIELD_EMAIL_STATUS] = statusId;
    if (bestEmail) payload[FIELD_BEST_EMAIL] = bestEmail;

    const success = await updatePerson(personId, payload);
    if (success) {
      updated++;
      progress[email] = 'updated';
    } else {
      failed++;
      progress[email] = 'failed';
    }

    if ((updated + failed) % 10 === 0) {
      fs.writeFileSync(CHECKPOINT, JSON.stringify(progress));
      console.log(`Progress: ${updated} updated, ${notFound} not found, ${failed} failed`);
    }

    await sleep(300); // Rate limit friendly
  }

  fs.writeFileSync(CHECKPOINT, JSON.stringify(progress));
  console.log(`\nDone! Updated: ${updated} | Not found: ${notFound} | Failed: ${failed}`);
}

main().catch(console.error);
