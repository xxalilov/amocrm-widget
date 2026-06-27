import React, { useEffect, useMemo, useState } from 'react';
import Toggle from '../components/Toggle';
import AutoMergeSection from '../components/AutoMergeSection';
import { fetchLeadSettings, updateLeadSettings } from '../api/settings';
import { fetchPipelines } from '../api/pipelines';
import { fetchAutoStatus } from '../api/auto';

const defaultSettings = {
  status: 'active',
  findDublicatesBy: 'byContact',
  checkPipelines: '',
  checkStatuses: '',
  advantage: 'newest',
  remainsStatus: 'first',
  isDifferentFunnelCheck: false,
  isTeg: false,
  teg: '',
  addMergedTag: false,
  mergedTag: 'merged',
  autoMerge: false,
  autoInterval: 5,
};

function parseIds(raw) {
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function serializeIds(set) {
  return Array.from(set).join(',');
}

export default function LeadSettingsTab() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [pipelines, setPipelines] = useState([]);
  const [pipelinesError, setPipelinesError] = useState(null);
  const [autoStatus, setAutoStatus] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchLeadSettings()
      .then((data) => { if (!cancelled) setSettings({ ...defaultSettings, ...data }); })
      .catch((err) => {
        if (err.status === 404) { if (!cancelled) setSettings(defaultSettings); }
        else console.error(err);
      })
      .finally(() => { if (!cancelled) { setLoading(false); setDirty(false); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetchPipelines()
      .then((data) => setPipelines(data || []))
      .catch((err) => setPipelinesError(err.message || 'Failed to load pipelines'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => fetchAutoStatus()
      .then((data) => { if (!cancelled) setAutoStatus(data?.lead || null); })
      .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const selectedPipelines = useMemo(() => parseIds(settings.checkPipelines), [settings.checkPipelines]);
  const selectedStatuses = useMemo(() => parseIds(settings.checkStatuses), [settings.checkStatuses]);

  const updateField = (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setStatusMsg(null);
  };

  const togglePipeline = (pipelineId, on) => {
    const next = new Set(selectedPipelines);
    if (on) next.add(String(pipelineId));
    else next.delete(String(pipelineId));
    updateField({ checkPipelines: serializeIds(next) });
  };

  const toggleStatus = (statusId, on) => {
    const next = new Set(selectedStatuses);
    if (on) next.add(String(statusId));
    else next.delete(String(statusId));
    updateField({ checkStatuses: serializeIds(next) });
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      // No on/off master toggle anymore — settings are always in effect.
      const saved = await updateLeadSettings({ ...settings, status: 'active' });
      setSettings({ ...defaultSettings, ...saved });
      setDirty(false);
      setStatusMsg({ kind: 'info', text: 'Настройки сохранены' });
    } catch (err) {
      setStatusMsg({ kind: 'error', text: err.message || 'Не удалось сохранить' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="muted">Загрузка настроек…</div>;

  return (
    <div className="settings-tab">
      <div className="toggle-row">
        <span>Искать дубли по</span>
        <select
          className="text-input"
          value={settings.findDublicatesBy}
          disabled={saving}
          onChange={(e) => updateField({ findDublicatesBy: e.target.value })}
        >
          <option value="byContact">Контакту</option>
          <option value="byCompany">Компании</option>
        </select>
      </div>

      <div className="pipelines-block">
        <div className="pipelines-block__title">Проверять сделки только в этих воронках и этапах</div>
        {pipelinesError && (
          <div className="status-msg status-msg--error">{pipelinesError}</div>
        )}
        {pipelines.length === 0 && !pipelinesError && (
          <div className="muted" style={{ padding: '8px 0' }}>Загрузка воронок…</div>
        )}
        {pipelines.map((p) => {
          const checked = selectedPipelines.has(String(p.id));
          const statuses = p.statuses || [];
          return (
            <div key={p.id} className="pipeline-group">
              <label className="pipeline pipeline--row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => togglePipeline(p.id, e.target.checked)}
                />
                <span className="pipeline__name">{p.name}</span>
                <span className="pipeline__count muted">этапов: {statuses.length}</span>
              </label>
              {statuses.length > 0 && (
                <div className="pipeline-statuses">
                  {statuses.map((s) => (
                    <label key={s.id} className="pipeline-status">
                      <input
                        type="checkbox"
                        checked={selectedStatuses.has(String(s.id))}
                        onChange={(e) => toggleStatus(s.id, e.target.checked)}
                      />
                      <span
                        className="pipeline-status__dot"
                        style={{ background: s.color || '#ccc' }}
                      />
                      <span className="pipeline-status__name">{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {pipelines.length > 0 && (
          <div className="muted" style={{ padding: '6px 0 0', lineHeight: 1.4 }}>
            Если воронки не выбраны — проверяются все. Если отмечены отдельные этапы —
            проверяются только сделки на этих этапах.
          </div>
        )}
      </div>

      <div className="toggle-row">
        <span>Чьи данные приоритетны (по дате создания)</span>
        <select
          className="text-input"
          value={settings.advantage}
          disabled={saving}
          onChange={(e) => updateField({ advantage: e.target.value })}
        >
          <option value="newest">Созданной последней</option>
          <option value="oldest">Созданной первой</option>
        </select>
      </div>

      <div className="toggle-row">
        <span>Какую сделку оставить (по дате создания)</span>
        <select
          className="text-input"
          value={settings.remainsStatus}
          disabled={saving}
          onChange={(e) => updateField({ remainsStatus: e.target.value })}
        >
          <option value="first">Созданную первой</option>
          <option value="last">Созданную последней</option>
        </select>
      </div>

      <div className="toggle-row">
        <span>Проверять между разными воронками</span>
        <Toggle
          checked={settings.isDifferentFunnelCheck}
          disabled={saving}
          onChange={(v) => updateField({ isDifferentFunnelCheck: v })}
        />
      </div>

      <div className="toggle-row">
        <span>Добавлять тег вместо объединения</span>
        <Toggle
          checked={settings.isTeg}
          disabled={saving}
          onChange={(v) => updateField({ isTeg: v })}
        />
      </div>

      {settings.isTeg && (
        <div className="toggle-row">
          <span>Название тега</span>
          <input
            type="text"
            className="text-input"
            value={settings.teg}
            disabled={saving}
            onChange={(e) => updateField({ teg: e.target.value })}
            placeholder="дубль"
          />
        </div>
      )}

      <div className="toggle-row">
        <span>Добавлять тег после объединения</span>
        <Toggle
          checked={settings.addMergedTag}
          disabled={saving}
          onChange={(v) => updateField({ addMergedTag: v })}
        />
      </div>

      {settings.addMergedTag && (
        <div className="toggle-row">
          <span>Название тега</span>
          <input
            type="text"
            className="text-input"
            value={settings.mergedTag}
            disabled={saving}
            onChange={(e) => updateField({ mergedTag: e.target.value })}
            placeholder="merged"
          />
        </div>
      )}

      <AutoMergeSection
        settings={settings}
        updateField={updateField}
        saving={saving}
        status={autoStatus}
      />

      {statusMsg && (
        <div className={`status-msg status-msg--${statusMsg.kind}`}>{statusMsg.text}</div>
      )}

      <div className="save-bar">
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={saving || !dirty}
          type="button"
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        {dirty && !saving && <span className="muted">Есть несохранённые изменения</span>}
      </div>
    </div>
  );
}
