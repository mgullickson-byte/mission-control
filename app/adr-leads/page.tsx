'use client';

import { useEffect, useMemo, useState } from 'react';

type LeadStatus = 'new' | 'contacted' | 'replied' | 'meeting' | 'won' | 'lost';

type Lead = {
  id: string;
  name: string;
  type: string;
  address: string;
  distance_miles: number;
  website: string;
  contact_name: string;
  contact_email: string;
  status: LeadStatus;
  notes: string;
  addedAt: string;
};

type SortKey = 'name' | 'type' | 'distance_miles' | 'status' | 'contact' | 'notes';

type SortState = {
  key: SortKey;
  direction: 'asc' | 'desc';
};

type LeadDraft = Pick<Lead, 'status' | 'notes' | 'contact_name' | 'contact_email'>;

type AddProspectDraft = Omit<Lead, 'addedAt'>;

const statusOrder: LeadStatus[] = [
  'new',
  'contacted',
  'replied',
  'meeting',
  'won',
  'lost'
];

const statusLabels: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  replied: 'Replied',
  meeting: 'Meeting',
  won: 'Won',
  lost: 'Lost'
};

const emptyAddDraft: AddProspectDraft = {
  id: '',
  name: '',
  type: '',
  address: '',
  distance_miles: 0.5,
  website: '',
  contact_name: '',
  contact_email: '',
  status: 'new',
  notes: ''
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function contactSummary(lead: Lead) {
  return [lead.contact_name, lead.contact_email].filter(Boolean).join(' · ') || 'No contact yet';
}

function noteSummary(notes: string) {
  const cleaned = notes.trim();
  if (!cleaned) return 'No notes yet';
  return cleaned.length > 88 ? `${cleaned.slice(0, 85)}...` : cleaned;
}

function compareStrings(a: string, b: string, direction: 'asc' | 'desc') {
  const result = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

export default function AdrLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState<'all' | LeadStatus>('all');
  const [sort, setSort] = useState<SortState>({
    key: 'distance_miles',
    direction: 'asc'
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LeadDraft>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<AddProspectDraft>(emptyAddDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isAddingProspect, setIsAddingProspect] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/adr-leads');
        if (!res.ok) {
          throw new Error('Failed to load prospects');
        }

        const data = (await res.json()) as { leads: Lead[] };
        setLeads(data.leads);
      } catch (err) {
        console.error(err);
        setError('Could not load ADR prospects.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const counts = useMemo(() => {
    return leads.reduce(
      (acc, lead) => {
        acc[lead.status] += 1;
        return acc;
      },
      {
        new: 0,
        contacted: 0,
        replied: 0,
        meeting: 0,
        won: 0,
        lost: 0
      } as Record<LeadStatus, number>
    );
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const base = filter === 'all' ? leads : leads.filter((lead) => lead.status === filter);

    return [...base].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return compareStrings(a.name, b.name, sort.direction);
        case 'type':
          return compareStrings(a.type, b.type, sort.direction);
        case 'distance_miles': {
          const result = a.distance_miles - b.distance_miles;
          return sort.direction === 'asc' ? result : -result;
        }
        case 'status': {
          const result = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
          return sort.direction === 'asc' ? result : -result;
        }
        case 'contact':
          return compareStrings(contactSummary(a), contactSummary(b), sort.direction);
        case 'notes':
          return compareStrings(a.notes, b.notes, sort.direction);
        default:
          return 0;
      }
    });
  }, [filter, leads, sort]);

  const handleSort = (key: SortKey) => {
    setSort((current) => {
      if (current.key !== key) {
        return { key, direction: 'asc' };
      }

      return {
        key,
        direction: current.direction === 'asc' ? 'desc' : 'asc'
      };
    });
  };

  const handleExpand = (lead: Lead) => {
    setExpandedId((current) => (current === lead.id ? null : lead.id));
    setDrafts((current) => ({
      ...current,
      [lead.id]: current[lead.id] ?? {
        status: lead.status,
        notes: lead.notes,
        contact_name: lead.contact_name,
        contact_email: lead.contact_email
      }
    }));
  };

  const updateDraft = (id: string, field: keyof LeadDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: field === 'status' ? (value as LeadStatus) : value
      }
    }));
  };

  const saveLead = async (lead: Lead) => {
    const draft = drafts[lead.id];
    if (!draft) return;

    try {
      setSavingId(lead.id);
      setError(null);

      const res = await fetch('/api/adr-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: lead.id,
          status: draft.status,
          notes: draft.notes,
          contact_name: draft.contact_name,
          contact_email: draft.contact_email
        })
      });

      if (!res.ok) {
        throw new Error('Failed to save prospect');
      }

      const data = (await res.json()) as { lead: Lead };
      setLeads((current) =>
        current.map((item) => (item.id === data.lead.id ? data.lead : item))
      );
    } catch (err) {
      console.error(err);
      setError(`Could not save ${lead.name}.`);
    } finally {
      setSavingId(null);
    }
  };

  const addProspect = async () => {
    const id = addDraft.id.trim() || slugify(addDraft.name);
    const name = addDraft.name.trim();
    const type = addDraft.type.trim();
    const address = addDraft.address.trim();

    if (!id || !name || !type || !address) {
      setError('Name, type, and address are required to add a prospect.');
      return;
    }

    try {
      setIsAddingProspect(true);
      setError(null);

      const res = await fetch('/api/adr-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          prospect: {
            ...addDraft,
            id,
            name,
            type,
            address,
            addedAt: new Date().toISOString()
          }
        })
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to add prospect');
      }

      const data = (await res.json()) as { lead: Lead };
      setLeads((current) => [data.lead, ...current]);
      setDrafts((current) => ({
        ...current,
        [data.lead.id]: {
          status: data.lead.status,
          notes: data.lead.notes,
          contact_name: data.lead.contact_name,
          contact_email: data.lead.contact_email
        }
      }));
      setExpandedId(data.lead.id);
      setIsAdding(false);
      setAddDraft({ ...emptyAddDraft });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not add prospect.');
    } finally {
      setIsAddingProspect(false);
    }
  };

  return (
    <main className="page-shell adr-page">
      <header className="adr-header">
        <div>
          <h1 className="page-title-main">ADR Local Prospects</h1>
          <p className="page-subtitle-main">
            Within ~2 miles of 1608 Argyle Ave, Hollywood
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setIsAdding((current) => !current)}
        >
          {isAdding ? 'Close Form' : 'Add Prospect'}
        </button>
      </header>

      <section className="adr-stats-grid">
        <div className="adr-stat-card">
          <span className="adr-stat-label">Total</span>
          <strong className="adr-stat-value">{leads.length}</strong>
        </div>
        {statusOrder.map((status) => (
          <div key={status} className="adr-stat-card">
            <span className="adr-stat-label">{statusLabels[status]}</span>
            <strong className="adr-stat-value">{counts[status]}</strong>
          </div>
        ))}
      </section>

      <section className="adr-filter-row">
        <button
          type="button"
          className={`ghost-button adr-filter-tab${filter === 'all' ? ' adr-filter-tab-active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {statusOrder.map((status) => (
          <button
            key={status}
            type="button"
            className={`ghost-button adr-filter-tab${
              filter === status ? ' adr-filter-tab-active' : ''
            }`}
            onClick={() => setFilter(status)}
          >
            {statusLabels[status]}
          </button>
        ))}
      </section>

      {error ? <p className="search-error">{error}</p> : null}

      <section className="adr-board">
        {isAdding ? (
          <div className="adr-add-card">
            <div className="field-row">
              <label className="field">
                <span className="field-label">Company</span>
                <input
                  className="field-input"
                  value={addDraft.name}
                  onChange={(e) =>
                    setAddDraft((current) => ({ ...current, name: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Type</span>
                <input
                  className="field-input"
                  value={addDraft.type}
                  onChange={(e) =>
                    setAddDraft((current) => ({ ...current, type: e.target.value }))
                  }
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Address</span>
              <input
                className="field-input"
                value={addDraft.address}
                onChange={(e) =>
                  setAddDraft((current) => ({ ...current, address: e.target.value }))
                }
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span className="field-label">Distance (Miles)</span>
                <input
                  className="field-input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={addDraft.distance_miles}
                  onChange={(e) =>
                    setAddDraft((current) => ({
                      ...current,
                      distance_miles: Number(e.target.value || 0)
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Website</span>
                <input
                  className="field-input"
                  value={addDraft.website}
                  onChange={(e) =>
                    setAddDraft((current) => ({ ...current, website: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span className="field-label">Contact Name</span>
                <input
                  className="field-input"
                  value={addDraft.contact_name}
                  onChange={(e) =>
                    setAddDraft((current) => ({
                      ...current,
                      contact_name: e.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Contact Email</span>
                <input
                  className="field-input"
                  value={addDraft.contact_email}
                  onChange={(e) =>
                    setAddDraft((current) => ({
                      ...current,
                      contact_email: e.target.value
                    }))
                  }
                />
              </label>
            </div>

            <label className="field">
              <span className="field-label">Notes</span>
              <textarea
                className="field-input field-textarea adr-notes-input"
                rows={3}
                value={addDraft.notes}
                onChange={(e) =>
                  setAddDraft((current) => ({ ...current, notes: e.target.value }))
                }
              />
            </label>

            <div className="adr-add-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setIsAdding(false);
                  setAddDraft({ ...emptyAddDraft });
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void addProspect()}
                disabled={isAddingProspect}
              >
                {isAddingProspect ? 'Adding...' : 'Save Prospect'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="table-wrap adr-table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSort('name')}
                  >
                    Company
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSort('type')}
                  >
                    Type
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSort('distance_miles')}
                  >
                    Distance
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSort('status')}
                  >
                    Status
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSort('contact')}
                  >
                    Contact
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSort('notes')}
                  >
                    Last Note
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="adr-empty-cell">
                    Loading ADR prospects...
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="adr-empty-cell">
                    No prospects match this filter.
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const isExpanded = expandedId === lead.id;
                  const draft = drafts[lead.id] ?? {
                    status: lead.status,
                    notes: lead.notes,
                    contact_name: lead.contact_name,
                    contact_email: lead.contact_email
                  };

                  return [
                    <tr
                      key={lead.id}
                      className={`adr-row${isExpanded ? ' adr-row-expanded' : ''}`}
                      onClick={() => handleExpand(lead)}
                    >
                      <td>
                        <div className="adr-company-cell">
                          <strong>{lead.name}</strong>
                          <span className="adr-company-added">
                            Added {new Date(lead.addedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td>{lead.type}</td>
                      <td>{lead.distance_miles.toFixed(1)} mi</td>
                      <td>
                        <span className={`pill adr-status-pill adr-status-${lead.status}`}>
                          {statusLabels[lead.status]}
                        </span>
                      </td>
                      <td>{contactSummary(lead)}</td>
                      <td>{noteSummary(lead.notes)}</td>
                    </tr>,
                    isExpanded ? (
                      <tr key={`${lead.id}-detail`} className="adr-detail-row">
                        <td colSpan={6}>
                          <div className="adr-detail-card">
                            <div className="adr-detail-meta">
                              <p className="adr-detail-text">
                                <span className="meta-label">Address</span>
                                <br />
                                {lead.address}
                              </p>
                              <p className="adr-detail-text">
                                <span className="meta-label">Website</span>
                                <br />
                                {lead.website ? (
                                  <a
                                    className="adr-link"
                                    href={lead.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {lead.website}
                                  </a>
                                ) : (
                                  'No website entered'
                                )}
                              </p>
                            </div>

                            <div className="field-row">
                              <label className="field">
                                <span className="field-label">Status</span>
                                <select
                                  className="field-input"
                                  value={draft.status}
                                  onChange={(e) =>
                                    updateDraft(lead.id, 'status', e.target.value)
                                  }
                                >
                                  {statusOrder.map((status) => (
                                    <option key={status} value={status}>
                                      {statusLabels[status]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field">
                                <span className="field-label">Contact Name</span>
                                <input
                                  className="field-input"
                                  value={draft.contact_name}
                                  onChange={(e) =>
                                    updateDraft(lead.id, 'contact_name', e.target.value)
                                  }
                                />
                              </label>
                            </div>

                            <div className="field-row">
                              <label className="field">
                                <span className="field-label">Contact Email</span>
                                <input
                                  className="field-input"
                                  value={draft.contact_email}
                                  onChange={(e) =>
                                    updateDraft(lead.id, 'contact_email', e.target.value)
                                  }
                                />
                              </label>
                              <div className="adr-inline-actions">
                                <button
                                  type="button"
                                  className="primary-button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void saveLead(lead);
                                  }}
                                  disabled={savingId === lead.id}
                                >
                                  {savingId === lead.id ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>

                            <label className="field">
                              <span className="field-label">Notes</span>
                              <textarea
                                className="field-input field-textarea adr-notes-input"
                                rows={4}
                                value={draft.notes}
                                onChange={(e) =>
                                  updateDraft(lead.id, 'notes', e.target.value)
                                }
                              />
                            </label>
                          </div>
                        </td>
                      </tr>
                    ) : null
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
