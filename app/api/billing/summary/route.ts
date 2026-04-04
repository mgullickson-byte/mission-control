// app/api/billing/summary/route.ts
// ─── Billing Summary API Endpoint ───
// Returns comprehensive billing data: daily/weekly/monthly spend, alerts, session list,
// and spending breakdown by model

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
    calculateModelCost,
    parseSessionLog,
    getDailySpend,
    getMonthlySpend,
    MONTHLY_BUDGET,
} from '@/lib/billing';

interface Session {
    sessionId: string;
    timestamp: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    status: string;
}

interface BillingSummaryResponse {
    today: number;
    week: number;
    month: number;
    monthlyBudget: number;
    budgetRemaining: number;
    budgetPercentage: number;
    sessions: Session[];
    alerts: string[];
    byModel: { [model: string]: number };
}

export async function GET(request: NextRequest): Promise<NextResponse<BillingSummaryResponse | { error: string }>> {
    try {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        // ─── Load billing data from cache ───
        const dailySummaryPath = path.join(process.cwd(), 'data', 'billing-daily.json');
        const billingData: { [date: string]: any } = fs.existsSync(dailySummaryPath)
            ? JSON.parse(fs.readFileSync(dailySummaryPath, 'utf-8'))
            : {};

        // ─── Calculate spend for today ───
        const todayStr = today.toISOString().split('T')[0];
        let todaySpend = getDailySpend(todayStr);

        // ─── Calculate spend for this week ───
        const weekDates = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            return date.toISOString().split('T')[0];
        });
        let weekSpend = weekDates.reduce((sum, date) => sum + getDailySpend(date), 0);

        // ─── Calculate spend for this month ───
        let monthSpend = getMonthlySpend(today.getFullYear(), today.getMonth() + 1);

        // ─── Parse active sessions from ~/.openclaw/agents/main/sessions/ ───
        const sessions: Session[] = [];
        const homeDir = process.env.HOME || '/root';
        const sessionDir = path.join(homeDir, '.openclaw', 'agents', 'main', 'sessions');

        if (fs.existsSync(sessionDir)) {
            const files = fs.readdirSync(sessionDir).filter((file) => file.endsWith('.jsonl'));
            files.forEach((file) => {
                try {
                    const sessionData = parseSessionLog(path.join(sessionDir, file));
                    sessionData.forEach((session) => {
                        const cost = calculateModelCost(session.model, session.inputTokens, session.outputTokens);
                        sessions.push({
                            sessionId: session.sessionId,
                            timestamp: session.timestamp.toISOString(),
                            model: session.model,
                            inputTokens: session.inputTokens,
                            outputTokens: session.outputTokens,
                            totalTokens: session.totalTokens,
                            cost,
                            status: 'Completed',
                        });
                    });
                } catch (error) {
                    console.error(`Error processing session file ${file}:`, error);
                }
            });
        }

        // ─── Generate alerts based on thresholds ───
        const alerts: string[] = [];

        if (todaySpend > 50) {
            alerts.push('⚠️ RED: Daily spend exceeds $50');
        } else if (todaySpend > 20) {
            alerts.push('⚠️ YELLOW: Daily spend exceeds $20');
        }

        const budgetRemaining = MONTHLY_BUDGET - monthSpend;
        const budgetPercentage = (monthSpend / MONTHLY_BUDGET) * 100;

        if (budgetPercentage > 80) {
            alerts.push('🔴 RED: Monthly budget >80% used');
        } else if (budgetPercentage > 50) {
            alerts.push('🟡 YELLOW: Monthly budget 50-80% used');
        }

        // Flag individual sessions >$5
        sessions.forEach((session) => {
            if (session.cost > 5) {
                alerts.push(`⚠️ Session ${session.sessionId.substring(0, 8)} costs $${session.cost.toFixed(2)}`);
            }
        });

        // ─── Calculate spending by model ───
        const byModel: { [model: string]: number } = {};
        sessions.forEach((session) => {
            if (!byModel[session.model]) {
                byModel[session.model] = 0;
            }
            byModel[session.model] += session.cost;
        });

        return NextResponse.json({
            today: todaySpend,
            week: weekSpend,
            month: monthSpend,
            monthlyBudget: MONTHLY_BUDGET,
            budgetRemaining: Math.max(0, budgetRemaining),
            budgetPercentage: Math.min(100, budgetPercentage),
            sessions,
            alerts,
            byModel,
        });
    } catch (error) {
        console.error('Error fetching billing summary:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
