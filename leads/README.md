# Leads CSVs

Mission Control treats CSV files in this folder as the source of truth for lead segments.

## File-per-segment

Each segment lives in its own CSV:

- `select-small-mid-agencies-us.csv`
- `select-inhouse-brands-us.csv`
- `select-agencies.csv`
- `select-production.csv`
- `studio-brands.csv`
- `studio-agencies.csv`

## Columns

All CSVs share the same header:

```csv
name,company,city,type,source,website,contact_name,contact_email,linkedin_url,notes
```

- **name**: Short label for this lead (often same as company, or a brand/studio name)
- **company**: Legal/primary company name
- **city**: City + state (or similar location string)
- **type**: One of `Agency`, `Prod`, or `Brand`
- **source**: How we found this lead (search term, list name, referral, etc.)
- **website**: Main URL for the company/brand (optional)
- **contact_name**: Person to reach out to (if known)
- **contact_email**: Email address for outreach (if known)
- **linkedin_url**: LinkedIn profile URL for the primary contact (optional)
- **notes**: Freeform notes (context, fit, campaign ideas)

## SmartReach-ready exports

A helper script will generate SmartReach-ready CSVs containing only rows with an email:

- Filters to leads where `contact_email` is non-empty
- Maps into columns SmartReach expects (First Name, Last Name, Email, Company, etc.)

Usage will live in a small Node script under `lib/` (see `lib/export-smartreach.ts`).
