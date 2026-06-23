import React, { useEffect, useState } from 'react';
import { fetchHistory } from '../api/history';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

const PAGE_SIZE = 50;

export default function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHistory(page, PAGE_SIZE)
      .then((res) => { if (!cancelled) { setRows(res.rows); setTotal(res.total); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load history'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) return <div className="muted">Загрузка истории…</div>;
  if (error) return <div className="status-msg status-msg--error">{error}</div>;
  if (total === 0) return <div className="muted" style={{ padding: '12px 0' }}>Операций пока нет.</div>;

  return (
    <div className="history-tab">
      <div className="dup-table-wrap">
        <table className="dup-table history-table">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Действие</th>
              <th>Основная</th>
              <th>Дубликаты</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.createdAt)}</td>
                <td>{r.type === 'contact' ? 'Контакт' : 'Сделка'}</td>
                <td>
                  {r.action === 'tag'
                    ? <span className="badge badge--tag">Тег{r.tag ? `: ${r.tag}` : ''}</span>
                    : <span className="badge badge--merge">Объединено</span>}
                </td>
                <td>
                  <div className="history-main">{r.mainName || `#${r.mainId}`}</div>
                  <div className="muted history-id">ID: {r.mainId}</div>
                </td>
                <td>
                  {(r.duplicates || []).map((d) => (
                    <div key={d.id} className="history-dup">
                      {d.name || `#${d.id}`} <span className="muted">({d.id})</span>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <button
            className="btn"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Назад
          </button>
          <span className="pager__info">Страница {page} из {totalPages} · всего {total}</span>
          <button
            className="btn"
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Вперёд →
          </button>
        </div>
      )}
    </div>
  );
}
