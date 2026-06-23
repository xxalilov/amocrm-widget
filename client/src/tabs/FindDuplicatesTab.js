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
  canNativeMerge,
  nativeMergeViaHost,
  logMerge,
} from '../api/duplicates';
import { fetchContactSettings, fetchLeadSettings } from '../api/settings';

function getName(item, type) {
  if (item.name) return item.name;
  if (type === 'contact') {
    return `${item.first_name || ''} ${item.last_name || ''}`.trim() || `Контакт #${item.id}`;
  }
  return `Сделка #${item.id}`;
}

// Prepositional case for «Поиск по …», accusative for «Введите …».
const FIELD_PREP = { phone: 'телефону', email: 'email', name: 'имени' };
const FIELD_ACC = { phone: 'телефон', email: 'email', name: 'имя' };

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
  // Whether each entity is in "tag instead of merge" mode. Tag mode stays on the
  // backend (OAuth); real merge goes through the host's native merge bridge.
  const tagMode = useRef({ contact: false, lead: false });

  useEffect(() => {
    fetchContactSettings()
      // When contact settings are disabled, the backend matches by phone, so the
      // search field should reflect that rather than the saved (inactive) field.
      .then((data) => {
        setContactField(data?.status === 'active' ? (data.fields || 'phone') : 'phone');
        tagMode.current.contact = !!(data?.status === 'active' && data?.isTeg);
      })
      .catch(() => setContactField('phone'));
    fetchLeadSettings()
      .then((data) => { tagMode.current.lead = !!(data?.status === 'active' && data?.isTeg); })
      .catch(() => {});
  }, []);

  // Perform one group's merge: tag-mode (or non-embedded fallback) goes through
  // the backend; otherwise run amoCRM's native merge via the host, then log it so
  // the History tab stays accurate.
  const runMerge = async (mainId, dupIds, snapshot) => {
    if (tagMode.current[type] || !canNativeMerge()) {
      await mergeEntities(type, mainId, dupIds, snapshot);
      return;
    }
    await nativeMergeViaHost(type, mainId, dupIds);
    await logMerge(type, mainId, dupIds, snapshot).catch(() => {});
  };

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
    if (type === 'lead') return 'Название сделки';
    return `Поиск по ${FIELD_PREP[contactField]}`;
  }, [type, contactField]);

  const searchButtonLabel = useMemo(() => {
    if (type === 'lead') return 'Поиск по имени';
    return `Поиск по ${FIELD_PREP[contactField]}`;
  }, [type, contactField]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setStatusMsg({
        kind: 'error',
        text: type === 'contact' ? `Введите ${FIELD_ACC[contactField]}` : 'Введите название сделки',
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
      if (items.length === 0) setStatusMsg({ kind: 'info', text: 'Дубликаты не найдены' });
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
    setStatusMsg({ kind: 'info', text: 'Запуск сканирования…' });
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
              ? 'В очереди… (выполняется другое сканирование)'
              : `Сканирование… проверено ${j.scanned} записей, найдено групп дублей: ${j.groupsFound}`,
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
      setStatusMsg(gs.length === 0 ? { kind: 'info', text: 'Дубликаты не найдены' } : null);
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
      await runMerge(mainId, dupIds, buildSnapshot(row.items, mainId));
      setStatusMsg({ kind: 'info', text: 'Успешно объединено' });
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
      message: `Объединить дубликаты (${dupIds.length}) в «${mainName}»?`,
      confirmLabel: 'Объединить',
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
      message: `Объединить ВСЕ группы (${groups.length})? Основная — выбранная запись (или первая в каждой группе).`,
      confirmLabel: 'Объединить все',
      onConfirm: () => { setConfirm(null); doMergeAll(groups); },
    });
  };

  const doMergeAll = async (groups) => {
    const scanId = scanRef.current + 1;
    scanRef.current = scanId;
    const isCancelled = () => scanRef.current !== scanId;

    setLoading(true);
    setStatusMsg({ kind: 'info', text: `Объединение 0/${groups.length}…` });

    // Native merge runs one group at a time through the host bridge, so we loop
    // here (the backend job below is only for tag-mode / non-embedded fallback).
    if (!tagMode.current[type] && canNativeMerge()) {
      let processed = 0;
      let failed = 0;
      for (const g of groups) {
        if (isCancelled()) return;
        try {
          await nativeMergeViaHost(type, g.mainId, g.duplicateIds);
          await logMerge(type, g.mainId, g.duplicateIds, { mainName: g.mainName, duplicates: g.duplicates }).catch(() => {});
        } catch (e) {
          failed += 1;
        }
        processed += 1;
        if (isCancelled()) return;
        const failedMsg = failed ? `, ошибок: ${failed}` : '';
        setStatusMsg({ kind: 'info', text: `Объединение… ${processed}/${groups.length}${failedMsg}` });
      }
      if (isCancelled()) return;
      mode === 'single' ? handleSearch() : handleFindAll();
      return;
    }

    try {
      const { jobId } = await startMergeAll(type, groups);
      await pollJob(jobId, {
        shouldCancel: isCancelled,
        onProgress: (j) => {
          if (isCancelled()) return;
          const failed = j.failed ? `, ошибок: ${j.failed}` : '';
          setStatusMsg({ kind: 'info', text: `Объединение… ${j.processed || 0}/${j.total || groups.length}${failed}` });
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

  const headerLabel = type === 'contact' ? 'Контакты' : 'Сделки';

  return (
    <div className="find-tab">
      <SectionCard title="Поиск дублей">
        <div className="find-form">
          <select
            className="find-form__select"
            value={type}
            onChange={(e) => handleType(e.target.value)}
          >
            <option value="contact">Контакт</option>
            <option value="lead">Сделка</option>
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
            Найти все дубли
          </button>
        </div>
      </SectionCard>

      {statusMsg && (
        <div className={`status-msg status-msg--${statusMsg.kind}`}>{statusMsg.text}</div>
      )}

      {loading && <div className="muted" style={{ padding: '12px 0' }}>Загрузка…</div>}

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
                    ОБЪЕДИНИТЬ ВСЕ
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
                        ОБЪЕДИНИТЬ
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted dup-table__hint">
            Нажмите на ячейку, чтобы сделать запись основной (выделяется зелёной рамкой).
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
