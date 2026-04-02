#!/usr/bin/env node
/**
 * parse-calendar.js
 * Parse Select Casting calendar .ics and extract:
 * - Zoom/Meet/Teams meetings (virtual)
 * - In-person meetings / travel
 * Categorize by type, extract attendee emails/names/companies
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SPREADSHEET_ID = '105mEt80hzxvWcYrDEnfd11BzY-e5ywzeNspbPi8BV84';

// Parse ICS file into event objects
function parseICS(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(l => l.trimEnd());
  
  // Unfold continuation lines
  const unfolded = [];
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (unfolded.length > 0) unfolded[unfolded.length - 1] += line.trim();
    } else {
      unfolded.push(line);
    }
  }

  const events = [];
  let current = null;

  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') {
      current = { attendees: [] };
    } else if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith('SUMMARY:')) current.summary = line.replace('SUMMARY:', '').replace(/\\,/g, ',').trim();
      else if (line.startsWith('DTSTART')) {
        const val = line.split(':')[1];
        current.start = val ? val.replace(/[TZ]/g, ' ').trim() : '';
      }
      else if (line.startsWith('DTEND')) {
        const val = line.split(':')[1];
        current.end = val ? val.replace(/[TZ]/g, ' ').trim() : '';
      }
      else if (line.startsWith('DESCRIPTION:')) current.description = line.replace('DESCRIPTION:', '').replace(/\\n/g, ' ').replace(/\\,/g, ',').trim();
      else if (line.startsWith('LOCATION:')) current.location = line.replace('LOCATION:', '').trim();
      else if (line.startsWith('ORGANIZER')) {
        const emailMatch = line.match(/mailto:([^\s]+)/);
        const cnMatch = line.match(/CN="([^"]+)"/);
        current.organizer = {
          email: emailMatch ? emailMatch[1] : '',
          name: cnMatch ? cnMatch[1] : ''
        };
      }
      else if (line.startsWith('ATTENDEE')) {
        const emailMatch = line.match(/mailto:([^\s]+)/);
        const cnMatch = line.match(/CN="([^"]+)"/);
        if (emailMatch) {
          const email = emailMatch[1].toLowerCase();
          // Skip Mike's own emails and calendar resources
          if (!email.includes('mike@select') && !email.includes('mgullickson') && 
              !email.includes('resource.calendar') && !email.includes('melissagullickson') &&
              !email.includes('72andsunny.com_')) {
            current.attendees.push({
              email: email,
              name: cnMatch ? cnMatch[1] : ''
            });
          }
        }
      }
      else if (line.startsWith('STATUS:')) current.status = line.replace('STATUS:', '').trim();
    }
  }

  return events;
}

// Categorize meeting type
function categorize(event) {
  const summary = (event.summary || '').toLowerCase();
  const desc = (event.description || '').toLowerCase();
  const loc = (event.location || '').toLowerCase();

  // Skip cancelled
  if (event.status === 'CANCELLED') return 'cancelled';
  
  // Skip personal/internal
  const skipKeywords = ['pay toyota', 'appliance repair', 'invoice', 'mortgage', 'dad\'s birthday', 'linked in', 'linkedin', 'reach out', 'hit up', 'pick up olivia', 'book dallas', 'order food', 'catering', 'financial review', 'legal notice', 'upwork'];
  if (skipKeywords.some(k => summary.includes(k))) return 'skip';

  // In-person
  if (loc && !loc.includes('zoom') && !loc.includes('meet.google') && !loc.includes('teams.microsoft') && loc.length > 10) return 'in-person';
  
  // Virtual meeting types
  if (desc.includes('zoom.us') || loc.includes('zoom')) return 'zoom';
  if (desc.includes('meet.google') || loc.includes('meet.google')) return 'google-meet';
  if (desc.includes('teams.microsoft') || loc.includes('teams.microsoft') || loc.toLowerCase() === 'microsoft teams meeting') return 'teams';
  
  // Has attendees = likely a real meeting
  if (event.attendees.length > 0) return 'virtual';
  
  // Notes/reminders
  return 'skip';
}

// Extract company from email domain
function companyFromEmail(email) {
  if (!email) return '';
  const domain = email.split('@')[1];
  if (!domain) return '';
  const parts = domain.replace('.com', '').replace('.net', '').replace('.tv', '').replace('.la', '').replace('.org', '').split('.');
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
}

async function main() {
  const events = parseICS(path.join(__dirname, '../data/select-casting-calendar.ics'));
  console.log('Total events:', events.length);

  const meetings = [];
  const skipped = { cancelled: 0, skip: 0 };

  for (const event of events) {
    const type = categorize(event);
    if (type === 'cancelled' || type === 'skip') { skipped[type]++; continue; }

    // Parse date
    const dateStr = event.start ? event.start.substring(0, 8) : '';
    let date = '';
    if (dateStr.length === 8) {
      date = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}`;
    }

    // Extract attendees
    for (const att of event.attendees) {
      if (!att.email || att.email.includes('@studioawesome') || att.email.includes('@selectvo') || att.email.includes('@select-casting') || att.email.includes('josiah@')) continue;
      
      const company = companyFromEmail(att.email);
      meetings.push({
        date,
        type,
        summary: event.summary || '',
        name: att.name || '',
        email: att.email,
        company,
        location: event.location || ''
      });
    }

    // If no attendees but has organizer and not Mike
    if (event.attendees.length === 0 && event.organizer && !event.organizer.email.includes('mike@select')) {
      const company = companyFromEmail(event.organizer.email);
      if (event.organizer.email && !event.organizer.email.includes('@studioawesome') && !event.organizer.email.includes('@selectvo')) {
        meetings.push({
          date,
          type,
          summary: event.summary || '',
          name: event.organizer.name || '',
          email: event.organizer.email,
          company,
          location: event.location || ''
        });
      }
    }
  }

  // Dedup by email+summary
  const seen = new Set();
  const unique = meetings.filter(m => {
    const key = m.email + '|' + m.date;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date desc
  unique.sort((a, b) => b.date.localeCompare(a.date));

  console.log('Meeting contacts extracted:', unique.length);
  console.log('Skipped cancelled:', skipped.cancelled, '| Skipped noise:', skipped.skip);

  // Categorize by type
  const byType = {};
  for (const m of unique) {
    byType[m.type] = (byType[m.type] || 0) + 1;
  }
  console.log('By type:', byType);

  // Write to Google Sheets
  const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, '../credentials/google-service-account.json'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const SHEET_NAME = 'SC - Calendar Meeting Contacts';

  // Create sheet
  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: SHEET_NAME } } }] }
    });
    console.log('Sheet created:', SHEET_NAME);
  } catch(e) {
    console.log('Sheet exists, updating...');
  }

  // Build rows
  const headers = ['Date', 'Type', 'Meeting', 'Name', 'Email', 'Company', 'Location'];
  const rows = [headers, ...unique.map(m => [m.date, m.type, m.summary, m.name, m.email, m.company, m.location])];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME + '!A1',
    valueInputOption: 'RAW',
    requestBody: { values: rows }
  });

  console.log('Written to Google Sheet:', rows.length - 1, 'rows');

  // Save CSV too
  const csv = [headers.join(','), ...unique.map(m => [m.date, m.type, `"${m.summary.replace(/"/g, '')}"`, `"${m.name}"`, m.email, m.company, `"${m.location}"`].join(','))].join('\n');
  fs.writeFileSync(path.join(__dirname, '../leads/calendar-meeting-contacts.csv'), csv);
  console.log('CSV saved: leads/calendar-meeting-contacts.csv');
}

main().catch(console.error);
