#!/usr/bin/env node

// scripts/build-billing-daily.js
// ─── Session Log Parser & Daily Summary Builder ───
// Cron job that polls ~/.openclaw/agents/main/sessions/ for JSONL files,
// calculates costs, and builds daily billing summaries.

const fs = require('fs');
const path = require('path');

// ─── Pricing Table ───
const PRICING_TABLE = {
    'anthropic/claude-sonnet-4-6': { in: 0.003, out: 0.015, cache: 0.0003 },
    'anthropic/claude-haiku-4-5': { in: 0.0008, out: 0.004, cache: 0.0001 },
    'openai/gpt-5.4': { in: 0.003, out: 0.015 },
    'ollama/*': { in: 0, out: 0 }, // Free
};

const MONTHLY_BUDGET = 300;

// ─── calculateModelCost ───
// Calculates cost from token counts and model pricing
const calculateModelCost = (model, inputTokens, outputTokens) => {
    const pricing = PRICING_TABLE[model] || PRICING_TABLE['ollama/*'];
    return inputTokens * pricing.in + outputTokens * pricing.out;
};

// ─── parseSessionLog ───
// Reads a JSONL file and extracts session data
const parseSessionLog = (filePath) => {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        return fileContent
            .split('\n')
            .map((line) => {
                try {
                    const parsed = JSON.parse(line.trim());
                    if (!parsed || !parsed.sessionId) return null;
                    return {
                        ...parsed,
                        timestamp: new Date(parsed.timestamp),
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
    } catch (error) {
        console.error(`Error parsing session log ${filePath}:`, error);
        return [];
    }
};

// ─── buildDailySummary ───
// Main function: scans session logs, calculates costs, updates daily summary
const buildDailySummary = () => {
    const summaryPath = path.join(process.cwd(), 'data', 'billing-daily.json');
    const dataDir = path.dirname(summaryPath);

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    // Load existing summary or create empty
    let dailySummary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) : {};

    const homeDir = process.env.HOME || '/root';
    const sessionDir = path.join(homeDir, '.openclaw', 'agents', 'main', 'sessions');

    // Check if session directory exists
    if (!fs.existsSync(sessionDir)) {
        console.log('ℹ️  Session directory does not exist:', sessionDir);
        return;
    }

    let processedCount = 0;
    let totalDailyCost = {};

    // ─── Process each JSONL file ───
    try {
        const files = fs.readdirSync(sessionDir).filter((file) => file.endsWith('.jsonl'));

        files.forEach((file) => {
            const filePath = path.join(sessionDir, file);
            const sessionData = parseSessionLog(filePath);

            sessionData.forEach((session) => {
                const dateStr = new Date(session.timestamp).toISOString().split('T')[0];

                if (!dailySummary[dateStr]) {
                    dailySummary[dateStr] = { totalUsd: 0, sessions: 0, models: {} };
                }

                const cost = calculateModelCost(session.model, session.inputTokens || 0, session.outputTokens || 0);

                dailySummary[dateStr].totalUsd += cost;
                dailySummary[dateStr].sessions++;

                if (!dailySummary[dateStr].models[session.model]) {
                    dailySummary[dateStr].models[session.model] = 0;
                }
                dailySummary[dateStr].models[session.model] += cost;

                if (!totalDailyCost[dateStr]) {
                    totalDailyCost[dateStr] = 0;
                }
                totalDailyCost[dateStr] += cost;

                processedCount++;
            });

            // Note: In production, you might want to archive rather than delete
            // Commenting out deletion for safety:
            // fs.unlinkSync(filePath);
        });

        // ─── Write updated summary ───
        fs.writeFileSync(summaryPath, JSON.stringify(dailySummary, null, 2));

        // ─── Log summary ───
        console.log(`\n✅ Billing Update Summary`);
        console.log(`─────────────────────────────────`);
        Object.keys(totalDailyCost)
            .sort()
            .reverse()
            .slice(0, 5)
            .forEach((dateStr) => {
                const data = dailySummary[dateStr];
                console.log(
                    `${dateStr}: $${data.totalUsd.toFixed(2)} (${data.sessions} sessions, Models: ${Object.keys(data.models).join(', ')})`
                );
            });

        console.log(`\n📊 Processed: ${processedCount} sessions`);
        console.log(`📁 Summary file: ${summaryPath}`);
    } catch (error) {
        console.error('❌ Error processing session logs:', error);
        process.exit(1);
    }
};

// ─── Run on execution ───
if (require.main === module) {
    buildDailySummary();
}

module.exports = { buildDailySummary };
