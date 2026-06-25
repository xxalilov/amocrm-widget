import React, { useEffect, useState } from 'react';
import { fetchStats } from '../api/stats';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatCard({ title, data }) {
  return (
    <div className="stat-card">
      <div className="stat-card__title">{title}</div>
      <div className="stat-row">
        <span className="stat-row__label">Просмотрено (последний скан)</span>
        <span className="stat-row__value">{data.scanned}</span>
      </div>
      <div className="stat-row">
        <span className="stat-row__label">Найдено групп дублей</span>
        <span className="stat-row__value">{data.groupsFound}</span>
      </div>
      <div className="stat-row">
        <span className="stat-row__label">Объединено записей</span>
        <span className="stat-row__value">{data.mergedRecords}</span>
      </div>
      <div className="stat-row">
        <span className="stat-row__label">Операций объединения</span>
        <span className="stat-row__value">{data.mergedOperations}</span>
      </div>
      <div className="stat-row stat-row--muted">
        <span className="stat-row__label">Последний скан</span>
        <span className="stat-row__value">{formatDate(data.scannedAt)}</span>
      </div>
    </div>
  );
}

export default function StatsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Не удалось загрузить статистику'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="muted">Загрузка статистики…</div>;
  if (error) return <div className="status-msg status-msg--error">{error}</div>;
  if (!stats) return null;

  return (
    <div className="stats-tab">
      <div className="stats-grid">
        <StatCard title="Контакты" data={stats.contact} />
        <StatCard title="Сделки" data={stats.lead} />
      </div>
      <div className="muted stats-last-merge">
        Последнее объединение: {formatDate(stats.lastMergeAt)}
      </div>
    </div>
  );
}
