import React, { useEffect, useMemo, useState } from 'react';
import Toggle from '../components/Toggle';
import { fetchLeadSettings, updateLeadSettings } from '../api/settings';
import { fetchPipelines } from '../api/pipelines';

const defaultSettings = {
  status: 'inactive',
  findDublicatesBy: 'byContact',
  checkPipelines: '',
  advantage: 'newest',
  remainsStatus: 'first',
  isDifferentFunnelCheck: false,
  isTeg: false,
  teg: '',
  addMergedTag: false,
  mergedTag: 'merged',
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

  const selectedPipelines = useMemo(() => parseIds(settings.checkPipelines), [settings.checkPipelines]);

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

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const saved = await updateLeadSettings(settings);
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
      {/* <InfoBanner>Configure how lead duplicates are detected and merged.</InfoBanner> */}

      <div className="toggle-row toggle-row--master">
        <span><strong>Включить настройки сделок</strong></span>
        <Toggle
          checked={settings.status === 'active'}
          disabled={saving}
          onChange={(v) => updateField({ status: v ? 'active' : 'inactive' })}
        />
      </div>

      {settings.status === 'active' && (
        <>
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
            <div className="pipelines-block__title">Проверять сделки только в этих воронках</div>
            {pipelinesError && (
              <div className="status-msg status-msg--error">{pipelinesError}</div>
            )}
            {pipelines.length === 0 && !pipelinesError && (
              <div className="muted" style={{ padding: '8px 0' }}>Загрузка воронок…</div>
            )}
            {pipelines.map((p) => {
              const checked = selectedPipelines.has(String(p.id));
              return (
                <label key={p.id} className="pipeline pipeline--row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => togglePipeline(p.id, e.target.checked)}
                  />
                  <span className="pipeline__name">{p.name}</span>
                  <span className="pipeline__count muted">этапов: {(p.statuses || []).length}</span>
                </label>
              );
            })}
            {selectedPipelines.size === 0 && pipelines.length > 0 && (
              <div className="muted" style={{ padding: '6px 0 0' }}>
                Воронки не выбраны — будут проверены все сделки.
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
        </>
      )}

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
