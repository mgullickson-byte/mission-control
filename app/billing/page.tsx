'use client';

import { useEffect, useState } from 'react';

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

interface BillingData {
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

const MetricCard = ({ title, value }: { title: string; value: string }) => (
    <div style={{ flex: 1, minWidth: '200px', padding: '20px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: '500', color: '#6b7280' }}>{title}</h3>
        <p style={{ margin: '0', fontSize: '28px', fontWeight: 'bold', color: '#1f2937' }}>{value}</p>
    </div>
);

export default function BillingPage() {
    const [data, setData] = useState<BillingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            const response = await fetch('/api/billing/summary');
            if (!response.ok) throw new Error('Failed to fetch');
            setData(await response.json());
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 300000);
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div style={{ padding: '20px' }}>Loading...</div>;
    if (error) return <div style={{ padding: '20px', color: '#dc2626' }}>Error: {error}</div>;
    if (!data) return <div style={{ padding: '20px' }}>No data</div>;

    const budgetColor = data.budgetPercentage > 80 ? '#ef4444' : data.budgetPercentage > 50 ? '#f59e0b' : '#10b981';

    return (
        <div style={{ padding: '40px 20px', maxWidth: '1400px', margin: '0 auto' }}>
            <h1 style={{ marginBottom: '30px', fontSize: '32px', fontWeight: '700' }}>Billing Dashboard</h1>

            {/* Metrics */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
                <MetricCard title="Today's Spend" value={`$${data.today.toFixed(2)}`} />
                <MetricCard title="This Week" value={`$${data.week.toFixed(2)}`} />
                <MetricCard title="This Month" value={`$${data.month.toFixed(2)}`} />
                <MetricCard title="Budget Remaining" value={`$${data.budgetRemaining.toFixed(2)}`} />
            </div>

            {/* Budget Bar */}
            <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '14px', fontWeight: '500' }}>Monthly Budget</label>
                    <span style={{ fontSize: '14px' }}>{Math.round(data.budgetPercentage)}%</span>
                </div>
                <div style={{ width: '100%', height: '24px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(data.budgetPercentage, 100)}%`, backgroundColor: budgetColor }} />
                </div>
            </div>

            {/* Alerts */}
            {data.alerts.length > 0 && (
                <div style={{ marginTop: '30px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Alerts</h2>
                    {data.alerts.map((alert, idx) => (
                        <div key={idx} style={{ padding: '12px', marginBottom: '8px', backgroundColor: alert.includes('RED') ? '#fee2e2' : '#fef3c7', borderRadius: '4px' }}>
                            {alert}
                        </div>
                    ))}
                </div>
            )}

            {/* Sessions */}
            {data.sessions.length > 0 && (
                <div style={{ marginTop: '40px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Sessions ({data.sessions.length})</h2>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Session ID</th>
                                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Model</th>
                                <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Cost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.sessions.slice(0, 20).map((session) => (
                                <tr key={session.sessionId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '12px' }}>{session.sessionId.substring(0, 12)}</td>
                                    <td style={{ padding: '12px' }}>{session.model}</td>
                                    <td style={{ padding: '12px', textAlign: 'right' }}>${session.cost.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Model Breakdown */}
            {Object.keys(data.byModel).length > 0 && (
                <div style={{ marginTop: '40px' }}>
                    <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px' }}>Spending by Model</h2>
                    {Object.entries(data.byModel).map(([model, cost]) => (
                        <div key={model} style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{model}</span>
                            <strong>${cost.toFixed(2)}</strong>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
