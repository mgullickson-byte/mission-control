// lib/billing.ts
// ─── Cost Calculation & Session Log Parsing ───
// Handles all pricing calculations, session log parsing, and daily summary building
// for the Mission Control billing dashboard.

import fs from 'fs';
import path from 'path';

interface TokenPricing {
    in: number;
    out: number;
    cache?: number;
}

const PRICING_TABLE: { [key: string]: TokenPricing } = {
    'anthropic/claude-sonnet-4-6': { in: 0.003, out: 0.015, cache: 0.0003 },
    'anthropic/claude-haiku-4-5': { in: 0.0008, out: 0.004, cache: 0.0001 },
    'openai/gpt-5.4': { in: 0.003, out: 0.015 },
    'ollama/*': { in: 0, out: 0 }, // Free
};

export interface SessionData {
    sessionId: string;
    timestamp: Date;
    model: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
}

export interface DailySummary {
    [date: string]: {
        totalUsd: number;
        sessions: number;
        models: { [model: string]: number };
    };
}

export const MONTHLY_BUDGET = 300;

// ─── calculateModelCost ───
// Calculates the cost of a session based on model and token counts
export const calculateModelCost = (
    model: string,
    inputTokens: number,
    outputTokens: number
): number => {
    const pricing = PRICING_TABLE[model] || PRICING_TABLE['ollama/*'];
    return inputTokens * pricing.in + outputTokens * pricing.out;
};

// ─── parseSessionLog ───
// Parses a JSONL session log file and extracts session data
export const parseSessionLog = (filePath: string): SessionData[] => {
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
                    } as SessionData;
                } catch {
                    return null;
                }
            })
            .filter(Boolean) as SessionData[];
    } catch (error) {
        console.error(`Error parsing session log ${filePath}:`, error);
        return [];
    }
};

// ─── buildDailySummary ───
// Groups sessions by day and calculates totals per model
export const buildDailySummary = (sessionDataArray: SessionData[]): DailySummary => {
    const summary: DailySummary = {};

    sessionDataArray.forEach((session) => {
        const dateStr = session.timestamp.toISOString().split('T')[0];
        if (!summary[dateStr]) {
            summary[dateStr] = { totalUsd: 0, sessions: 0, models: {} };
        }

        const cost = calculateModelCost(session.model, session.inputTokens, session.outputTokens);
        summary[dateStr].totalUsd += cost;
        summary[dateStr].sessions++;

        if (!summary[dateStr].models[session.model]) {
            summary[dateStr].models[session.model] = 0;
        }
        summary[dateStr].models[session.model] += cost;
    });

    return summary;
};

// ─── getDailySpend ───
// Retrieves spend for a specific date from billing-daily.json
export const getDailySpend = (date: string): number => {
    const billingDataPath = path.join(process.cwd(), 'data', 'billing-daily.json');
    if (!fs.existsSync(billingDataPath)) return 0;

    try {
        const dailySummary = JSON.parse(fs.readFileSync(billingDataPath, 'utf-8'));
        return dailySummary[date]?.totalUsd || 0;
    } catch {
        return 0;
    }
};

// ─── getMonthlySpend ───
// Calculates total spend for a given month
export const getMonthlySpend = (year: number, month: number): number => {
    const billingDataPath = path.join(process.cwd(), 'data', 'billing-daily.json');
    if (!fs.existsSync(billingDataPath)) return 0;

    try {
        const dailySummary = JSON.parse(fs.readFileSync(billingDataPath, 'utf-8'));
        let totalMonthlySpend = 0;

        for (const date in dailySummary) {
            const [yearStr, monthStr] = date.split('-');
            if (+yearStr === year && +monthStr === month) {
                totalMonthlySpend += dailySummary[date].totalUsd;
            }
        }

        return totalMonthlySpend;
    } catch {
        return 0;
    }
};
