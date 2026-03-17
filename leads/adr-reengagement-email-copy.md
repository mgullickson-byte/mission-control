# SA ADR Re-Engagement Email Campaign — Draft Copy

**List:** SA - ADR Re-Engagement (591 contacts, all MV verified ok)
**Angle:** Warm re-engagement. These are past clients/contacts — people who've worked with Studio Awesome or been in ADR/audio conversations with Mike. Not cold outreach.

---

## Email 1 (Day 1) — The Check-In

**Subject options:**
- Been a while — wanted to reach out
- Checking in from Studio Awesome
- {{first_name}}, long time no talk

**Body:**

Hey {{first_name}},

Hope things are going well on your end.

It's been a while since we last connected, and I wanted to reach out. Studio Awesome has been busy — we've been doing a lot of ADR, mix, and sound design work out of our Hollywood space at 1608 Argyle, and I've been thinking about folks we worked with before.

If you've got a project in the pipeline that needs ADR, dialog prep, or a mix — I'd love to reconnect and see if we can help.

What are you working on these days?

Mike

*Studio Awesome | 1608 Argyle Ave, Hollywood | studioawesome.la*

---

## Email 2 (Day 5) — The Value Touch

**Subject options:**
- What we've been up to at Studio Awesome
- ADR + mix — a few things we've added

**Body:**

Hey {{first_name}},

Didn't want to be a pest, but wanted to share what we've been building over at Studio Awesome before I leave you alone.

Quick snapshot of what we do:
- **ADR & dialog recording** — Dolby-certified booth, director/client remote monitoring, same-day turnaround when needed
- **Theatrical & broadcast mix** — Dolby Atmos, stereo, 5.1, all deliverables
- **Sound design & editorial** — from full post packages to just-the-last-mile cleanup

We're in Hollywood, walking distance from most of the productions in the 90028/90038 corridor.

If any of this fits what you're doing, I'd love a quick call. If not, no worries — hope to cross paths on a project soon.

Mike

*Studio Awesome | 1608 Argyle Ave, Hollywood | studioawesome.la*

---

## Email 3 (Day 12) — The Close

**Subject options:**
- Last one, I promise
- {{first_name}} — one last note

**Body:**

Hey {{first_name}},

Last note from me for a while.

If you've got ADR, mix, or post audio work coming up — or if you know someone who does — I'd love an intro. We do great work and we're easy to work with.

Reply any time. Otherwise, I'll let you get back to it.

Mike

*Studio Awesome | 1608 Argyle Ave, Hollywood | studioawesome.la*

---

## Notes for Mike

- **591 contacts total** — all MV verified (ok quality), all have ADR signals in email history
- Breakdown: 181 confirmed clients, 78 mixed (client + vendor), 332 unknown relationship
- Top industries: Brand/Client/Advertiser (387), Media/Entertainment/Creative (97), Recording Studio/Audio Post (61)
- Consider splitting into two sub-lists: confirmed clients (181) get warmer copy; unknowns get slightly more introductory tone
- Do NOT send to competitors (61 contacts in "Recording studio / audio post / sound design" segment) — filter those out before pushing to SmartReach
- Josiah's inbox NOT included yet (separate task `task-josiah-inbox-check`) — this list is Mike's email history only

---

## SmartReach Setup

1. Create list: **SA - ADR Re-Engagement**
2. Import: `/leads/adr-reengagement-smartreach.csv` (591 rows)
3. Filter out `industry_segment = "Recording studio / audio post / sound design"` (~61 rows) before import
4. Create campaign with 3-email sequence above
5. Set sending schedule: weekdays only, 8am–5pm PT, 10–20/day (these are warm contacts, no need to blast)
