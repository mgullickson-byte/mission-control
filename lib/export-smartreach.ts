import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

/**
 * Generate a SmartReach-ready CSV from a leads segment CSV.
 *
 * - Filters to rows with a non-empty contact_email
 * - Splits contact_name into first/last name when possible
 * - Maps fields into typical SmartReach columns
 */
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node lib/export-smartreach.js <input.csv> <output.csv>');
    process.exit(1);
  }

  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output);

  const raw = fs.readFileSync(inputPath, 'utf8');
  const records: any[] = parse(raw, {
    columns: true,
    skip_empty_lines: true
  });

  const filtered = records.filter((row) =>
    row.contact_email && String(row.contact_email).trim().length > 0
  );

  const mapped = filtered.map((row) => {
    const name = String(row.contact_name || '').trim();
    const [firstName, ...rest] = name.split(' ');
    const lastName = rest.join(' ');

    return {
      FirstName: firstName || '',
      LastName: lastName || '',
      Email: row.contact_email || '',
      Company: row.company || row.name || '',
      Title: '',
      City: row.city || '',
      Segment: row.type || '',
      Source: row.source || '',
      Website: row.website || '',
      LinkedIn: row.linkedin_url || row.linkedin || '',
      Notes: row.notes || ''
    };
  });

  const csv = stringify(mapped, {
    header: true
  });

  fs.writeFileSync(outputPath, csv, 'utf8');
  console.log(`Wrote SmartReach CSV with ${mapped.length} rows to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
