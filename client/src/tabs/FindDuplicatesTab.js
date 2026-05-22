import React, { useEffect, useMemo, useState } from 'react';
import SectionCard from '../components/SectionCard';
import {
  searchContactsByPhone,
  searchLeadsByName,
  findAllContactDuplicates,
  findAllLeadDuplicatesByName,
  mergeEntities,
} from '../api/duplicates';
import { fetchContactSettings } from '../api/settings';

function getName(item, type) {
  if (item.name) return item.name;
  if (type === 'contact') {
    return `${item.first_name || ''} ${item.last_name || ''}`.trim() || `Contact #${item.id}`;
  }
  return `Lead #${item.id}`;
}

const FIELD_LABEL = {
  phone: 'phone',
  email: 'email',
  name: 'name',
};

const SINGLE_KEY = '__single__';

export default function FindDuplicatesTab({ subdomain, accountId, onAuthRequired }) {
  const [type, setType] = useState('contact');
  const [contactField, setContactField] = useState('phone');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selections, setSelections] = useState({});
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => {
    if (!accountId) return;
    fetchContactSettings(accountId)
      .then((data) => setContactField(data?.fields || 'phone'))
      .catch(() => setContactField('phone'));
  }, [accountId]);

  const reset = () => {
    setDuplicates([]);
    setGroups([]);
    setSelections({});
    setStatusMsg(null);
    setMode(null);
  };

  const handleType = (next) => {
    setType(next);
    reset();
  };

  const placeholder = useMemo(() => {
    if (type === 'lead') return 'Lead name';
    return `Search by ${FIELD_LABEL[contactField]}`;
  }, [type, contactField]);

  const searchButtonLabel = useMemo(() => {
    if (type === 'lead') return 'Search by name';
    return `Search by ${FIELD_LABEL[contactField]}`;
  }, [type, contactField]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setStatusMsg({
        kind: 'error',
        text: type === 'contact' ? `Enter ${FIELD_LABEL[contactField]}` : 'Enter lead name',
      });
      return;
    }
    setLoading(true);
    setMode('single');
    setStatusMsg(null);
    try {
      const data = type === 'contact'
        ? await searchContactsByPhone(subdomain, searchTerm)
        : await searchLeadsByName(subdomain, searchTerm);
      const items = data.duplicates || [];
      setDuplicates(items);
      setGroups([]);
      setSelections(items[0] ? { [SINGLE_KEY]: items[0].id } : {});
      if (items.length === 0) setStatusMsg({ kind: 'info', text: 'No duplicates found' });
    } catch (err) {
      if (err.status === 401) onAuthRequired?.();
      else setStatusMsg({ kind: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFindAll = async () => {
    setLoading(true);
    setMode('all');
    setStatusMsg(null);
    try {
      const data = type === 'contact'
        ? await findAllContactDuplicates(subdomain)
        : await findAllLeadDuplicatesByName(subdomain);
      const gs = data.groups || [];
      setGroups(gs);
      setDuplicates([]);
      const sel = {};
      for (const g of gs) {
        const key = g.phone || g.name;
        sel[key] = g.items[0]?.id;
      }
      setSelections(sel);
      if (gs.length === 0) setStatusMsg({ kind: 'info', text: 'No duplicates found' });
    } catch (err) {
      if (err.status === 401) onAuthRequired?.();
      else setStatusMsg({ kind: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    if (mode === 'single' && duplicates.length > 0) {
      return [{ key: SINGLE_KEY, label: searchTerm, items: duplicates }];
    }
    if (mode === 'all') {
      return groups.map((g) => ({
        key: g.phone || g.name,
        label: g.phone || g.name,
        items: g.items,
      }));
    }
    return [];
  }, [mode, duplicates, groups, searchTerm]);

  const maxCols = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.items.length), 0),
    [rows],
  );

  const buildSnapshot = (items, mainId) => {
    const main = items.find((i) => i.id === mainId);
    return {
      mainName: main ? getName(main, type) : '',
      duplicates: items
        .filter((i) => i.id !== mainId)
        .map((i) => ({ id: i.id, name: getName(i, type) })),
    };
  };

  const mergeRow = async (row) => {
    const mainId = selections[row.key];
    if (!mainId) return;
    const dupIds = row.items.filter((i) => i.id !== mainId).map((i) => i.id);
    if (dupIds.length === 0) return;
    if (!window.confirm(`Merge ${dupIds.length} duplicates?`)) return;
    try {
      await mergeEntities(subdomain, type, mainId, dupIds, buildSnapshot(row.items, mainId));
      setStatusMsg({ kind: 'info', text: 'Merged successfully' });
      mode === 'single' ? handleSearch() : handleFindAll();
    } catch (err) {
      setStatusMsg({ kind: 'error', text: err.message });
    }
  };

  const mergeAll = async () => {
    if (rows.length === 0) return;
    if (!window.confirm('Merge ALL groups? (main = most recent)')) return;
    setLoading(true);
    try {
      for (const row of rows) {
        const sorted = [...row.items].sort((a, b) => b.updated_at - a.updated_at);
        const mainId = sorted[0].id;
        const dupIds = sorted.slice(1).map((i) => i.id);
        if (dupIds.length === 0) continue;
        await mergeEntities(subdomain, type, mainId, dupIds, buildSnapshot(row.items, mainId)).catch(console.error);
      }
      setStatusMsg({ kind: 'info', text: 'All groups merged' });
      mode === 'single' ? handleSearch() : handleFindAll();
    } finally {
      setLoading(false);
    }
  };

  const headerLabel = type === 'contact' ? 'Contacts' : 'Leads';

  return (
    <div className="find-tab">
      <SectionCard title="Find duplicates">
        <div className="find-form">
          <select
            className="find-form__select"
            value={type}
            onChange={(e) => handleType(e.target.value)}
          >
            <option value="contact">Contact</option>
            <option value="lead">Lead</option>
          </select>
          <input
            className="find-form__input"
            type="text"
            placeholder={placeholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn--primary" onClick={handleSearch} disabled={loading} type="button">
            {searchButtonLabel}
          </button>
          <button className="btn btn--dark" onClick={handleFindAll} disabled={loading} type="button">
            Find all duplicates
          </button>
        </div>
      </SectionCard>

      {statusMsg && (
        <div className={`status-msg status-msg--${statusMsg.kind}`}>{statusMsg.text}</div>
      )}

      {loading && <div className="muted" style={{ padding: '12px 0' }}>Loading…</div>}

      {rows.length > 0 && (
        <div className="dup-table-wrap">
          <table className="dup-table">
            <thead>
              <tr>
                <th className="dup-table__title" colSpan={maxCols}>{headerLabel}</th>
                <th className="dup-table__action-head">
                  <button
                    className="btn btn--danger"
                    onClick={mergeAll}
                    disabled={loading}
                    type="button"
                  >
                    MERGE ALL
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const main = selections[row.key];
                return (
                  <tr key={row.key}>
                    {row.items.map((item) => {
                      const isMain = main === item.id;
                      return (
                        <td
                          key={item.id}
                          className={`dup-table__cell ${isMain ? 'dup-table__cell--main' : ''}`}
                          onClick={() => setSelections((p) => ({ ...p, [row.key]: item.id }))}
                          title={`ID: ${item.id}`}
                        >
                          <div className="dup-table__name">{getName(item, type)}</div>
                        </td>
                      );
                    })}
                    {Array.from({ length: maxCols - row.items.length }).map((_, i) => (
                      <td key={`empty-${row.key}-${i}`} className="dup-table__cell dup-table__cell--empty" />
                    ))}
                    <td className="dup-table__action">
                      <button
                        className="btn btn--primary"
                        onClick={() => mergeRow(row)}
                        disabled={loading || row.items.length < 2}
                        type="button"
                      >
                        MERGE
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted dup-table__hint">
            Click a cell to set it as the main record (highlighted with green border).
          </div>
        </div>
      )}
    </div>
  );
}
