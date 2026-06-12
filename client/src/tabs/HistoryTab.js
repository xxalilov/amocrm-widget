import React, { useEffect, useState } from 'react';
import { fetchHistory } from '../api/history';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHistory()
      .then((data) => { if (!cancelled) setRows(data || []); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load history'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="muted">Loading history…</div>;
  if (error) return <div className="status-msg status-msg--error">{error}</div>;
  if (rows.length === 0) return <div className="muted" style={{ padding: '12px 0' }}>No operations yet.</div>;

  return (
    <div className="history-tab">
      <div className="dup-table-wrap">
        <table className="dup-table history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Action</th>
              <th>Main</th>
              <th>Duplicates</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{formatDate(r.createdAt)}</td>
                <td>{r.type === 'contact' ? 'Contact' : 'Lead'}</td>
                <td>
                  {r.action === 'tag'
                    ? <span className="badge badge--tag">Tagged{r.tag ? `: ${r.tag}` : ''}</span>
                    : <span className="badge badge--merge">Merged</span>}
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
    </div>
  );
}
