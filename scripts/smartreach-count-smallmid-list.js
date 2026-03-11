#!/usr/bin/env node

// Count prospects in SmartReach with list = "Small & Midsize Ad Agencies"

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env.local');

function loadEnv() {
  const env = {};
  if (!fs.existsSync(ENV_PATH)) return env;
  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const apiKey = env.SMARTREACH_API_KEY;
  const baseUrl = env.SMARTREACH_API_BASE || 'https://api.smartreach.io';
  const teamId = env.SMARTREACH_TEAM_ID;
  const listName = env.SMARTREACH_SMALL_MID_LIST || 'Small & Midsize Ad Agencies';

  if (!apiKey || !teamId) {
    console.error('Missing SMARTREACH_API_KEY or SMARTREACH_TEAM_ID');
    process.exit(1);
  }

  let page = 1;
  let total = 0;
  let matching = 0;

  while (true) {
    const url = new URL(`/api/v1/prospects?page=${page}&team_id=${encodeURIComponent(teamId)}`, baseUrl).toString();
    const res = await fetch(url, {
      headers: { 'X-API-KEY': apiKey }
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('Non-JSON response for page', page, text);
      break;
    }

    if (!res.ok || data.status !== 'success') {
      console.error('Error fetching prospects page', page, data);
      break;
    }

    const prospects = data?.data?.prospects || [];
    if (prospects.length === 0) break;

    total += prospects.length;
    for (const p of prospects) {
      if (p.list === listName) matching++;
    }

    if (prospects.length < 500) break; // API returns up to 500 per page
    page += 1;
  }

  console.log('Total prospects (team):', total);
  console.log(`Prospects with list = "${listName}":`, matching);
}

main().catch((err) => {
  console.error('Error counting SmartReach prospects', err);
  process.exit(1);
});
