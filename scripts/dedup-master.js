#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const ROOT = process.cwd();
const LEADS_DIR = path.join(ROOT, 'leads');

const SOURCE_CONFIGS = [
  {
    listName: 'agency-production-contacts-verified',
    file: 'agency-production-contacts-verified.csv',
    defaultCategory: 'Ad Agency',
    type: 'agency'
  },
  {
    listName: 'agency-producers-VO-non-major-markets-ok',
    file: 'agency-producers-VO-non-major-markets-ok.csv',
    defaultCategory: 'Ad Agency',
    type: 'agency'
  },
  {
    listName: 'agency-producers-on-camera-nychiLA-ok',
    file: 'agency-producers-on-camera-nychiLA-ok.csv',
    defaultCategory: 'Ad Agency',
    type: 'agency'
  },
  {
    listName: 'selectvo-all-contacts-verified',
    file: 'selectvo-all-contacts-verified.csv',
    type: 'selectvo'
  },
  {
    listName: 'studioawesome-email-contacts',
    file: 'studioawesome-email-contacts.csv',
    type: 'pipedrive'
  },
  {
    listName: 'studioawesome-adr-campaign',
    file: 'studioawesome-adr-campaign.csv',
    type: 'adr'
  },
  {
    listName: 'freelance-producers',
    file: 'freelance-producers.csv',
    defaultCategory: 'Freelance Producer',
    type: 'freelance'
  }
];

const TAXONOMY = [
  'Ad Agency',
  'Production Company',
  'Talent Agency / Casting',
  'Brand / Direct Client',
  'Media / Entertainment',
  'Recording Studio',
  'Freelance Producer',
  'Legal',
  'Personal / Unknown',
  'Other / Unknown'
];

const SC_RELEVANT = new Set([
  normalizeTaxonomyKey('Ad Agency'),
  normalizeTaxonomyKey('Production Company'),
  normalizeTaxonomyKey('Brand / Direct Client'),
  normalizeTaxonomyKey('Freelance Producer')
]);

const SA_RELEVANT = new Set([
  normalizeTaxonomyKey('Ad Agency'),
  normalizeTaxonomyKey('Production Company'),
  normalizeTaxonomyKey('Brand / Direct Client'),
  normalizeTaxonomyKey('Media / Entertainment'),
  normalizeTaxonomyKey('Recording Studio'),
  normalizeTaxonomyKey('Freelance Producer')
]);

const CAMPAIGN_PRIORITY = [
  'Pipedrive - Existing Client',
  'SmartReach - Agency Producers',
  'SmartReach - SA ADR',
  'SmartReach - SelectVO Cold'
];

const CAMPAIGN_OUTPUTS = {
  'Pipedrive - Existing Client': 'campaign-pipedrive-existing-client.csv',
  'SmartReach - Agency Producers': 'campaign-smartreach-agency-producers.csv',
  'SmartReach - SA ADR': 'campaign-smartreach-sa-adr.csv',
  'SmartReach - SelectVO Cold': 'campaign-smartreach-selectvo-cold.csv'
};

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function isLikelyEmail(value) {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeTaxonomyKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing CSV file: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    return { rows: [], columns: [] };
  }

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });

  const columns = Object.keys(rows[0] || {});
  return { rows, columns };
}

function writeCsvFile(filePath, rows, preferredColumns = []) {
  const colSet = new Set(preferredColumns);
  for (const row of rows) {
    for (const col of Object.keys(row)) colSet.add(col);
  }

  const columns = Array.from(colSet);
  const out = stringify(rows, {
    header: true,
    columns
  });

  fs.writeFileSync(filePath, out, 'utf8');
}

function categoryFromSourceRow(row, config) {
  const direct = row.category;
  const industrySegment = row.industry_segment;
  const refinedIndustry = row.refined_industry;
  const industryGuess = row.industry_guess;
  const company = row.company || row.company_name || row.company_guess || '';

  const candidates = [direct, industrySegment, refinedIndustry, industryGuess, config.defaultCategory];
  let category = normalizeCategory(candidates);

  if (!category && config.type === 'agency') {
    category = 'Ad Agency';
  }

  if (!category && config.type === 'freelance') {
    category = 'Freelance Producer';
  }

  if (!category && config.type === 'pipedrive') {
    if (/studio|audio post|sound design/i.test(String(industrySegment || refinedIndustry || ''))) {
      category = 'Recording Studio';
    } else {
      category = 'Other / Unknown';
    }
  }

  if (!category && /law|legal/i.test(String(company))) {
    category = 'Legal';
  }

  if (!category) category = 'Other / Unknown';
  return category;
}

function normalizeCategory(values) {
  for (const value of values) {
    const key = normalizeTaxonomyKey(value);
    if (!key) continue;

    if (key === 'adagency' || key === 'agencymarketingpr') return 'Ad Agency';
    if (key === 'productioncompany' || key === 'productionposteditorialmedia') return 'Production Company';
    if (key === 'talentagencycasting' || key === 'talentcastingvoice') return 'Talent Agency / Casting';
    if (key === 'branddirectclient' || key === 'brandclientendadvertiser') return 'Brand / Direct Client';
    if (key === 'mediaentertainment' || key === 'mediaentertainmentcreative') return 'Media / Entertainment';
    if (key === 'recordingstudio' || key === 'recordingstudioaudiopostsounddesign') return 'Recording Studio';
    if (key === 'freelanceproducer') return 'Freelance Producer';
    if (key === 'legal') return 'Legal';
    if (key === 'personalunknown') return 'Personal / Unknown';

    if (
      key === 'otherunknown' ||
      key === 'unknown' ||
      key === 'education' ||
      key === 'finance' ||
      key === 'audiogearsoftwarevendornotarecordingstudio' ||
      key === 'industryassociationnotastudio' ||
      key === 'unionindustryorg' ||
      key === 'othervendorunknown'
    ) {
      return 'Other / Unknown';
    }

    if (TAXONOMY.some((cat) => normalizeTaxonomyKey(cat) === key)) {
      return TAXONOMY.find((cat) => normalizeTaxonomyKey(cat) === key);
    }
  }

  return null;
}

function toBooleanString(value) {
  return value ? 'True' : 'False';
}

function splitName(row) {
  const first = normalizeText(row.first_name);
  const last = normalizeText(row.last_name);
  if (first || last) return { first_name: first, last_name: last };

  const full = normalizeText(row.name);
  if (!full) return { first_name: '', last_name: '' };

  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' ')
  };
}

function recommendedCampaignFor(flags) {
  if (flags.inPipedrive) return 'Pipedrive - Existing Client';
  if (flags.inAgency) return 'SmartReach - Agency Producers';
  if (flags.inSelectVoOnly) return 'SmartReach - SelectVO Cold';
  if (flags.inAdr) return 'SmartReach - SA ADR';
  return '';
}

function exportCampaignList(campaignName, outputFile, masterRows) {
  const targetPriority = CAMPAIGN_PRIORITY.indexOf(campaignName);
  if (targetPriority === -1) {
    throw new Error(`Unknown campaign: ${campaignName}`);
  }

  const higherCampaigns = new Set(CAMPAIGN_PRIORITY.slice(0, targetPriority));
  const higherEmails = new Set(
    masterRows
      .filter((row) => higherCampaigns.has(row.recommended_campaign))
      .map((row) => row.email)
  );

  const filtered = masterRows
    .filter((row) => row.recommended_campaign === campaignName)
    .filter((row) => !higherEmails.has(row.email))
    .map((row) => ({
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      company: row.company,
      category: row.category
    }));

  writeCsvFile(outputFile, filtered, ['email', 'first_name', 'last_name', 'company', 'category']);
  return filtered.length;
}

function main() {
  const masterIndex = new Map();

  for (const config of SOURCE_CONFIGS) {
    const filePath = path.join(LEADS_DIR, config.file);
    const { rows, columns } = parseCsvFile(filePath);
    const updatedRows = [];

    for (const row of rows) {
      const category = categoryFromSourceRow(row, config);
      const categoryKey = normalizeTaxonomyKey(category);
      const scRelevant = SC_RELEVANT.has(categoryKey);
      const saRelevant = SA_RELEVANT.has(categoryKey);

      const normalizedRow = {
        ...row,
        category,
        sc_relevant: toBooleanString(scRelevant),
        sa_relevant: toBooleanString(saRelevant)
      };
      updatedRows.push(normalizedRow);

      const email = normalizeEmail(row.email);
      if (!isLikelyEmail(email)) {
        continue;
      }

      const company = normalizeText(row.company || row.company_name || row.company_guess);
      const nameParts = splitName(row);
      const fallbackName = normalizeText(row.name || [nameParts.first_name, nameParts.last_name].filter(Boolean).join(' '));

      if (!masterIndex.has(email)) {
        masterIndex.set(email, {
          email,
          name: fallbackName,
          first_name: nameParts.first_name,
          last_name: nameParts.last_name,
          company,
          category,
          sc_relevant: toBooleanString(scRelevant),
          sa_relevant: toBooleanString(saRelevant),
          appears_in_lists: new Set([config.listName]),
          hasPipedrive: config.type === 'pipedrive',
          hasAgency: config.type === 'agency',
          hasSelectVo: config.type === 'selectvo',
          hasAdr: config.type === 'adr'
        });
      } else {
        const entry = masterIndex.get(email);
        entry.appears_in_lists.add(config.listName);

        if (!entry.name && fallbackName) entry.name = fallbackName;
        if (!entry.first_name && nameParts.first_name) entry.first_name = nameParts.first_name;
        if (!entry.last_name && nameParts.last_name) entry.last_name = nameParts.last_name;
        if (!entry.company && company) entry.company = company;

        const currentCategoryKey = normalizeTaxonomyKey(entry.category);
        if (currentCategoryKey === normalizeTaxonomyKey('Other / Unknown') && categoryKey !== currentCategoryKey) {
          entry.category = category;
          entry.sc_relevant = toBooleanString(scRelevant);
          entry.sa_relevant = toBooleanString(saRelevant);
        }

        entry.hasPipedrive = entry.hasPipedrive || config.type === 'pipedrive';
        entry.hasAgency = entry.hasAgency || config.type === 'agency';
        entry.hasSelectVo = entry.hasSelectVo || config.type === 'selectvo';
        entry.hasAdr = entry.hasAdr || config.type === 'adr';
      }
    }

    const newColumns = [...columns];
    if (!newColumns.includes('category')) newColumns.push('category');
    if (!newColumns.includes('sc_relevant')) newColumns.push('sc_relevant');
    if (!newColumns.includes('sa_relevant')) newColumns.push('sa_relevant');

    writeCsvFile(filePath, updatedRows, newColumns);
  }

  const masterRows = Array.from(masterIndex.values())
    .map((entry) => {
      const appearsInLists = Array.from(entry.appears_in_lists).sort();
      const recommended_campaign = recommendedCampaignFor({
        inPipedrive: entry.hasPipedrive,
        inAgency: entry.hasAgency,
        inAdr: entry.hasAdr,
        inSelectVoOnly: entry.hasSelectVo && appearsInLists.length === 1
      });

      return {
        email: entry.email,
        name: entry.name,
        first_name: entry.first_name,
        last_name: entry.last_name,
        company: entry.company,
        category: entry.category,
        sc_relevant: entry.sc_relevant,
        sa_relevant: entry.sa_relevant,
        appears_in_lists: appearsInLists.join(','),
        recommended_campaign
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  const reportRows = masterRows.map((row) => ({
    email: row.email,
    name: row.name,
    company: row.company,
    category: row.category,
    sc_relevant: row.sc_relevant,
    sa_relevant: row.sa_relevant,
    appears_in_lists: row.appears_in_lists,
    recommended_campaign: row.recommended_campaign
  }));

  const reportPath = path.join(LEADS_DIR, 'master-dedup-report.csv');
  writeCsvFile(reportPath, reportRows, [
    'email',
    'name',
    'company',
    'category',
    'sc_relevant',
    'sa_relevant',
    'appears_in_lists',
    'recommended_campaign'
  ]);

  for (const campaign of CAMPAIGN_PRIORITY) {
    const outputFile = path.join(LEADS_DIR, CAMPAIGN_OUTPUTS[campaign]);
    const count = exportCampaignList(campaign, outputFile, masterRows);
    console.log(`${campaign}: ${count} contacts -> ${outputFile}`);
  }

  console.log(`Master report written: ${reportPath}`);
  console.log(`Unique emails indexed: ${masterRows.length}`);
}

main();
