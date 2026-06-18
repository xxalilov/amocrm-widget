import React, { useEffect, useMemo, useRef, useState } from 'react';
import SectionCard from '../components/SectionCard';
import ConfirmModal from '../components/ConfirmModal';
import {
  searchContactsByPhone,
  searchLeadsByName,
  startFindAllContactDuplicates,
  startFindAllLeadDuplicates,
  pollJob,
  mergeEntities,
  startMergeAll,
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

export default function FindDuplicatesTab({ onAuthRequired }) {
  const [type, setType] = useState('contact');
  const [contactField, setContactField] = useState('phone');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selections, setSelections] = useState({});
  const [statusMsg, setStatusMsg] = useState(null);
  // In-widget confirmation dialog: { message, confirmLabel, onConfirm } or null.
  const [confirm, setConfirm] = useState(null);
  // Bumped whenever we start a new scan or reset, so a stale poll loop self-cancels.
  const scanRef = useRef(0);

  useEffect(() => {
    fetchContactSettings()
      // When contact settings are disabled, the backend matches by phone, so the
      // search field should reflect that rather than the saved (inactive) field.
      .then((data) => setContactField(data?.status === 'active' ? (data.fields || 'phone') : 'phone'))
      .catch(() => setContactField('phone'));
  }, []);

  const reset = () => {
    scanRef.current += 1; // cancel any in-flight scan poll
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
        ? await searchContactsByPhone(searchTerm)
        : await searchLeadsByName(searchTerm);
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
    const scanId = scanRef.current + 1;
    scanRef.current = scanId;
    const isCancelled = () => scanRef.current !== scanId;

    setLoading(true);
    setMode('all');
    setStatusMsg({ kind: 'info', text: 'Starting scan…' });
    try {
      const { jobId } = type === 'contact'
        ? await startFindAllContactDuplicates()
        : await startFindAllLeadDuplicates();

      const job = await pollJob(jobId, {
        shouldCancel: isCancelled,
        onProgress: (j) => {
          if (isCancelled()) return;
          setStatusMsg({
            kind: 'info',
            text: j.queued
              ? 'Queued… (another scan is running)'
              : `Scanning… ${j.scanned} records checked, ${j.groupsFound} duplicate group(s) so far`,
          });
        },
      });

      if (!job || isCancelled()) return; // cancelled (type switched / reset)

      const gs = job.groups || [];
      setGroups(gs);
      setDuplicates([]);
      const sel = {};
      for (const g of gs) {
        const key = g.key ?? g.phone ?? g.name;
        sel[key] = g.items[0]?.id;
      }
      setSelections(sel);
      setStatusMsg(gs.length === 0 ? { kind: 'info', text: 'No duplicates found' } : null);
    } catch (err) {
      if (isCancelled()) return;
      if (err.status === 401) onAuthRequired?.();
      else setStatusMsg({ kind: 'error', text: err.message });
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  };

  const rows = useMemo(() => {
    if (mode === 'single' && duplicates.length > 0) {
      return [{ key: SINGLE_KEY, label: searchTerm, items: duplicates }];
    }
    if (mode === 'all') {
      return groups.map((g) => ({
        key: g.key ?? g.phone ?? g.name,
        label: g.phone ?? g.name,
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

  const doMergeRow = async (row, mainId, dupIds) => {
    try {
      await mergeEntities(type, mainId, dupIds, buildSnapshot(row.items, mainId));
      setStatusMsg({ kind: 'info', text: 'Merged successfully' });
      mode === 'single' ? handleSearch() : handleFindAll();
    } catch (err) {
      setStatusMsg({ kind: 'error', text: err.message });
    }
  };

  const mergeRow = (row) => {
    const mainId = selections[row.key];
    if (!mainId) return;
    const dupIds = row.items.filter((i) => i.id !== mainId).map((i) => i.id);
    if (dupIds.length === 0) return;
    const mainName = getName(row.items.find((i) => i.id === mainId), type);
    setConfirm({
      message: `Merge ${dupIds.length} duplicate(s) into “${mainName}”?`,
      confirmLabel: 'Merge',
      onConfirm: () => { setConfirm(null); doMergeRow(row, mainId, dupIds); },
    });
  };

  const mergeAll = () => {
    if (rows.length === 0) return;

    // Build the merge payload, respecting the user's per-row selection and
    // otherwise the server's suggested main (items[0]).
    const groups = [];
    for (const row of rows) {
      const mainId = selections[row.key] ?? row.items[0]?.id;
      if (!mainId) continue;
      const dupIds = row.items.filter((i) => i.id !== mainId).map((i) => i.id);
      if (dupIds.length === 0) continue;
      const snap = buildSnapshot(row.items, mainId);
      groups.push({ mainId, duplicateIds: dupIds, mainName: snap.mainName, duplicates: snap.duplicates });
    }
    if (groups.length === 0) return;

    setConfirm({
      message: `Merge ALL ${groups.length} group(s)? Main = the selected record (or the first in each group).`,
      confirmLabel: 'Merge all',
      onConfirm: () => { setConfirm(null); doMergeAll(groups); },
    });
  };

  const doMergeAll = async (groups) => {
    const scanId = scanRef.current + 1;
    scanRef.current = scanId;
    const isCancelled = () => scanRef.current !== scanId;

    setLoading(true);
    setStatusMsg({ kind: 'info', text: `Merging 0/${groups.length}…` });
    try {
      const { jobId } = await startMergeAll(type, groups);
      await pollJob(jobId, {
        shouldCancel: isCancelled,
        onProgress: (j) => {
          if (isCancelled()) return;
          const failed = j.failed ? `, ${j.failed} failed` : '';
          setStatusMsg({ kind: 'info', text: `Merging… ${j.processed || 0}/${j.total || groups.length}${failed}` });
        },
      });
      if (isCancelled()) return;
      // Refresh the list (also resets loading via handleFindAll/handleSearch).
      mode === 'single' ? handleSearch() : handleFindAll();
    } catch (err) {
      if (isCancelled()) return;
      setStatusMsg({ kind: 'error', text: err.message });
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

      <ConfirmModal
        open={!!confirm}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
