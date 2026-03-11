'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export type LeadType = 'Agency' | 'Prod' | 'Brand';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export type Lead = {
  name: string;
  company: string;
  city: string;
  type: LeadType;
  source: string;
  website?: string;
  contact_name?: string;
  contact_email?: string;
  notes?: string;
  isNew?: boolean;
  approval_status?: ApprovalStatus;
};

export type LeadOwner = 'Scout' | 'Echo' | 'Henry';

export type LeadSegment = {
  company: 'Select Casting' | 'Studio Awesome';
  key: string;
  label: string;
  goal: string;
  owner: LeadOwner;
  csvFile: string;
  leads: Lead[];
  newCount: number;
};

const companies: Array<LeadSegment['company']> = ['Select Casting', 'Studio Awesome'];

type SortKey = keyof Lead;

type SortState = {
  key: SortKey;
  direction: 'asc' | 'desc';
};

type ApprovalFilter = 'all' | 'pending' | 'approved' | 'rejected';

function getLeadKey(lead: Lead): string {
  return `${lead.company}::${lead.city}::${lead.contact_email ?? ''}`.toLowerCase();
}

export default function LeadsPage() {
  const [segments, setSegments] = useState<LeadSegment[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);
  const [downloading, setDownloading] = useState<null | 'csv' | 'smartreach'>(null);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');
  const [selectedLeadKeys, setSelectedLeadKeys] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/leads/segments');
        if (!res.ok) return;
        const data = (await res.json()) as { segments: LeadSegment[] };
        setSegments(data.segments || []);
        if (!selectedKey && data.segments[0]) {
          setSelectedKey(data.segments[0].key);
          setApprovalFilter(data.segments[0].newCount > 0 ? 'pending' : 'all');
        }
      } catch {
        // ignore for now
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedSegments = useMemo(
    () =>
      companies.map((company) => ({
        company,
        lists: segments.filter((segment) => segment.company === company)
      })),
    [segments]
  );

  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.key === selectedKey) ?? segments[0] ?? null,
    [segments, selectedKey]
  );

  const sortedLeads = useMemo(() => {
    if (!selectedSegment) return [];
    const leads = [...selectedSegment.leads];

    // Default view: show new leads first (in CSV order), then older ones
    if (!sort) {
      const newLeads = leads.filter((lead) => lead.isNew);
      const oldLeads = leads.filter((lead) => !lead.isNew);
      return [...newLeads, ...oldLeads];
    }

    leads.sort((a, b) => {
      const aValue = a[sort.key] ?? '';
      const bValue = b[sort.key] ?? '';

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (aStr < bStr) return sort.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return leads;
  }, [selectedSegment, sort]);

  const approvalCounts = useMemo(() => {
    const all = sortedLeads.length;
    const pending = sortedLeads.filter(
      (l) => (l.approval_status ?? 'pending') === 'pending'
    ).length;
    const approved = sortedLeads.filter((l) => l.approval_status === 'approved').length;
    const rejected = sortedLeads.filter((l) => l.approval_status === 'rejected').length;
    return { all, pending, approved, rejected };
  }, [sortedLeads]);

  const filteredLeads = useMemo(() => {
    if (approvalFilter === 'all') return sortedLeads;
    return sortedLeads.filter(
      (lead) => (lead.approval_status ?? 'pending') === approvalFilter
    );
  }, [sortedLeads, approvalFilter]);

  const handleSort = (key: SortKey) => {
    setSort((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const handleDownload = async (mode: 'csv' | 'smartreach') => {
    if (!selectedSegment) return;
    try {
      setDownloading(mode);
      const route =
        mode === 'csv'
          ? `/api/leads/${encodeURIComponent(selectedSegment.key)}/export`
          : `/api/leads/${encodeURIComponent(selectedSegment.key)}/smartreach`;

      const res = await fetch(route);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        mode === 'csv'
          ? `${selectedSegment.key}.csv`
          : `${selectedSegment.key}-smartreach.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  };

  const handleSelectSegment = async (segment: LeadSegment) => {
    setSelectedKey(segment.key);
    setSelectedLeadKeys(new Set());
    setSort(null);
    setApprovalFilter(segment.newCount > 0 ? 'pending' : 'all');

    // Mark this segment as seen so NEW badge goes away on next load
    try {
      await fetch(`/api/leads/${encodeURIComponent(segment.key)}/seen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total: segment.leads.length })
      });
    } catch {
      // non-fatal
    }

    // Optimistically clear local new flags
    setSegments((current) =>
      current.map((s) =>
        s.key === segment.key
          ? {
              ...s,
              newCount: 0,
              leads: s.leads.map((lead) => ({ ...lead, isNew: false }))
            }
          : s
      )
    );
  };

  // Checkbox logic
  const allFilteredKeys = useMemo(
    () => filteredLeads.map(getLeadKey),
    [filteredLeads]
  );

  const allSelected =
    filteredLeads.length > 0 &&
    allFilteredKeys.every((k) => selectedLeadKeys.has(k));

  const someSelected = !allSelected && allFilteredKeys.some((k) => selectedLeadKeys.has(k));

  const handleSelectAll = () => {
    if (allSelected) {
      // Deselect all visible
      setSelectedLeadKeys((prev) => {
        const next = new Set(prev);
        allFilteredKeys.forEach((k) => next.delete(k));
        return next;
      });
    } else {
      // Select all visible
      setSelectedLeadKeys((prev) => {
        const next = new Set(prev);
        allFilteredKeys.forEach((k) => next.add(k));
        return next;
      });
    }
  };

  const handleToggleRow = (lead: Lead) => {
    const key = getLeadKey(lead);
    setSelectedLeadKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleApprove = async (status: 'approved' | 'rejected') => {
    if (!selectedSegment || selectedLeadKeys.size === 0 || approving) return;
    const keys = Array.from(selectedLeadKeys);

    // Optimistic update
    setSegments((current) =>
      current.map((s) =>
        s.key === selectedSegment.key
          ? {
              ...s,
              leads: s.leads.map((lead) =>
                keys.includes(getLeadKey(lead))
                  ? { ...lead, approval_status: status }
                  : lead
              )
            }
          : s
      )
    );
    setSelectedLeadKeys(new Set());

    try {
      setApproving(true);
      await fetch('/api/leads/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys, status })
      });
    } finally {
      setApproving(false);
    }
  };

  const selectedCount = Array.from(selectedLeadKeys).filter((k) =>
    allFilteredKeys.includes(k)
  ).length;

  return (
    <main className="page-shell">
      <header className="projects-header">
        <div>
          <h1 className="page-title-main">Leads</h1>
          <p className="page-subtitle-main">
            Your outbound engine: the key segments Scout and Echo should be working every week.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/search" className="nav-link inline">
            Web Search
          </Link>
          {selectedSegment && (
            <>
              <button
                type="button"
                className="ghost-button"
                onClick={() => handleDownload('csv')}
                disabled={downloading !== null}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => handleDownload('smartreach')}
                disabled={downloading !== null}
              >
                SmartReach CSV
              </button>
            </>
          )}
        </div>
      </header>

      <section className="projects-body">
        <aside className="projects-list">
          <ul className="projects-list-items">
            {groupedSegments.map((group) => (
              <li key={group.company}>
                <h2 className="group-title" style={{ margin: '4px 4px 6px' }}>
                  {group.company}
                </h2>
                {group.lists.map((segment) => (
                  <button
                    key={segment.key}
                    type="button"
                    className={
                      'projects-list-item' +
                      (selectedSegment && selectedSegment.key === segment.key
                        ? ' projects-list-item-active'
                        : '')
                    }
                    onClick={() => handleSelectSegment(segment)}
                  >
                    <div className="projects-list-main">
                      <h3 className="projects-list-name">{segment.label}</h3>
                      <p className="projects-list-description">{segment.goal}</p>
                    </div>
                    <div className="projects-list-meta">
                      <span className="pill pill-soft">
                        {segment.leads.length} leads
                      </span>
                      {segment.newCount > 0 && (
                        <span className="pill pill-soft leads-new-pill">
                          NEW +{segment.newCount}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </aside>

        <section className="projects-detail">
          {selectedSegment ? (
            <div className="projects-detail-card">
              <header className="projects-detail-header">
                <div>
                  <h2 className="projects-detail-title">{selectedSegment.label}</h2>
                  <p className="projects-detail-subtitle">{selectedSegment.goal}</p>
                </div>
                <div className="projects-detail-meta">
                  <span className="pill pill-soft">{selectedSegment.company}</span>
                  <span className="pill pill-soft">Owner: {selectedSegment.owner}</span>
                </div>
              </header>

              <div className="projects-detail-body">
                {/* Approval filter tabs */}
                <div className="leads-filter-bar">
                  {(['all', 'pending', 'approved', 'rejected'] as ApprovalFilter[]).map(
                    (tab) => (
                      <button
                        key={tab}
                        type="button"
                        className={
                          'leads-filter-tab' +
                          (approvalFilter === tab ? ' leads-filter-tab-active' : '')
                        }
                        onClick={() => {
                          setApprovalFilter(tab);
                          setSelectedLeadKeys(new Set());
                        }}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        <span className="leads-filter-count">{approvalCounts[tab]}</span>
                      </button>
                    )
                  )}
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            className="leads-checkbox"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someSelected;
                            }}
                            onChange={handleSelectAll}
                            aria-label="Select all"
                          />
                        </th>
                        <th>
                          <button
                            className="table-sort-button"
                            type="button"
                            onClick={() => handleSort('company')}
                          >
                            Company
                          </button>
                        </th>
                        <th>
                          <button
                            className="table-sort-button"
                            type="button"
                            onClick={() => handleSort('city')}
                          >
                            City
                          </button>
                        </th>
                        <th>
                          <button
                            className="table-sort-button"
                            type="button"
                            onClick={() => handleSort('type')}
                          >
                            Type
                          </button>
                        </th>
                        <th>
                          <button
                            className="table-sort-button"
                            type="button"
                            onClick={() => handleSort('source')}
                          >
                            Source
                          </button>
                        </th>
                        <th>
                          <button
                            className="table-sort-button"
                            type="button"
                            onClick={() => handleSort('contact_name')}
                          >
                            Contact
                          </button>
                        </th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((lead) => {
                        const leadKey = getLeadKey(lead);
                        const isChecked = selectedLeadKeys.has(leadKey);
                        const status = lead.approval_status ?? 'pending';
                        return (
                          <tr
                            key={leadKey}
                            className={
                              (lead.isNew ? 'lead-row-new' : '') +
                              (isChecked ? ' lead-row-selected' : '')
                            }
                          >
                            <td>
                              <input
                                type="checkbox"
                                className="leads-checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleRow(lead)}
                                aria-label={`Select ${lead.company}`}
                              />
                            </td>
                            <td>{lead.company}</td>
                            <td>{lead.city}</td>
                            <td>{lead.type}</td>
                            <td>{lead.source}</td>
                            <td>{lead.contact_name}</td>
                            <td>
                              <span className={`approval-pill approval-pill-${status}`}>
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="projects-detail-card">
              <p className="page-subtitle-main">
                No lead segments loaded yet. Check the `leads/` folder for CSV files.
              </p>
            </div>
          )}
        </section>
      </section>

      {/* Bulk action bar — shown when rows are checked */}
      {selectedCount > 0 && (
        <div className="leads-action-bar">
          <span className="leads-action-count">{selectedCount} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="leads-action-btn leads-action-btn-approve"
              onClick={() => handleApprove('approved')}
              disabled={approving}
            >
              Approve Selected
            </button>
            <button
              type="button"
              className="leads-action-btn leads-action-btn-reject"
              onClick={() => handleApprove('rejected')}
              disabled={approving}
            >
              Reject Selected
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
