// Enrich Agency Producers list with LinkedIn URLs via Apollo people search
const fs = require('fs');
const https = require('https');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const APOLLO_API_KEY = process.env.APOLLO_API_KEY || require('../.env.local').split('\n').find(l => l.startsWith('APOLLO_API_KEY'))?.split('=')[1]?.trim();
const INPUT = 'leads/agency-production-contacts-verified.csv';
const OUTPUT = 'leads/agency-production-contacts-linkedin.csv';
const CHECKPOINT = 'leads/agency-producers-linkedin-progress.json';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apolloEnrich(firstName, lastName, email, companyName) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      api_key: APOLLO_API_KEY,
      first_name: firstName,
      last_name: lastName,
      email: email,
      organization_name: companyName
    });

    const options = {
      hostname: 'api.apollo.io',
      path: '/v1/people/match',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const linkedin = json?.person?.linkedin_url || '';
          resolve(linkedin);
        } catch(e) {
          resolve('');
        }
      });
    });

    req.on('error', () => resolve(''));
    req.setTimeout(10000, () => { req.destroy(); resolve(''); });
    req.write(body);
    req.end();
  });
}

async function main() {
  const content = fs.readFileSync(INPUT, 'utf8');
  const records = parse(content, { columns: true });
  
  // Load checkpoint
  let progress = {};
  if (fs.existsSync(CHECKPOINT)) {
    progress = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
  }

  const results = [];
  let found = 0;
  let processed = 0;

  for (const record of records) {
    const key = record.email;
    
    if (progress[key]) {
      results.push({ ...record, linkedin_url: progress[key] });
      if (progress[key]) found++;
      processed++;
      continue;
    }

    const linkedin = await apolloEnrich(
      record.first_name,
      record.last_name,
      record.email,
      record.company_name
    );

    progress[key] = linkedin;
    results.push({ ...record, linkedin_url: linkedin });
    if (linkedin) found++;
    processed++;

    if (processed % 10 === 0) {
      fs.writeFileSync(CHECKPOINT, JSON.stringify(progress, null, 2));
      console.log(`Progress: ${processed}/${records.length} — LinkedIn found: ${found}`);
    }

    await sleep(600); // ~100 requests/minute
  }

  // Save checkpoint and output
  fs.writeFileSync(CHECKPOINT, JSON.stringify(progress, null, 2));
  
  const output = stringify(results, { header: true });
  fs.writeFileSync(OUTPUT, output);
  
  console.log(`\nDone! ${found}/${records.length} LinkedIn URLs found`);
  console.log(`Output: ${OUTPUT}`);
}

main().catch(console.error);
