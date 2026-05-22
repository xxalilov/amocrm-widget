import React, { useEffect, useMemo, useState } from 'react';
import InfoBanner from '../components/InfoBanner';
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
};

function parseIds(raw) {
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function serializeIds(set) {
  return Array.from(set).join(',');
}

export default function LeadSettingsTab({ accountId, subdomain }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [pipelines, setPipelines] = useState([]);
  const [pipelinesError, setPipelinesError] = useState(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setLoading(true);
    fetchLeadSettings(accountId)
      .then((data) => { if (!cancelled) setSettings({ ...defaultSettings, ...data }); })
      .catch((err) => {
        if (err.status === 404) { if (!cancelled) setSettings(defaultSettings); }
        else console.error(err);
      })
      .finally(() => { if (!cancelled) { setLoading(false); setDirty(false); } });
    return () => { cancelled = true; };
  }, [accountId]);

  useEffect(() => {
    if (!subdomain) return;
    fetchPipelines(subdomain)
      .then((data) => setPipelines(data || []))
      .catch((err) => setPipelinesError(err.message || 'Failed to load pipelines'));
  }, [subdomain]);

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
    if (!accountId) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const saved = await updateLeadSettings(accountId, settings);
      setSettings({ ...defaultSettings, ...saved });
      setDirty(false);
      setStatusMsg({ kind: 'info', text: 'Settings saved' });
    } catch (err) {
      setStatusMsg({ kind: 'error', text: err.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="muted">Loading settings…</div>;

  return (
    <div className="settings-tab">
      <InfoBanner>Configure how lead duplicates are detected and merged.</InfoBanner>

      <div className="toggle-row toggle-row--master">
        <span><strong>Enable lead settings</strong></span>
        <Toggle
          checked={settings.status === 'active'}
          disabled={saving}
          onChange={(v) => updateField({ status: v ? 'active' : 'inactive' })}
        />
      </div>

      {settings.status === 'active' && (
        <>
          <div className="toggle-row">
            <span>Find duplicates by</span>
            <select
              className="text-input"
              value={settings.findDublicatesBy}
              disabled={saving}
              onChange={(e) => updateField({ findDublicatesBy: e.target.value })}
            >
              <option value="byContact">Contact</option>
              <option value="byCompany">Company</option>
            </select>
          </div>

          <div className="pipelines-block">
            <div className="pipelines-block__title">Check only leads in these pipelines</div>
            {pipelinesError && (
              <div className="status-msg status-msg--error">{pipelinesError}</div>
            )}
            {pipelines.length === 0 && !pipelinesError && (
              <div className="muted" style={{ padding: '8px 0' }}>Loading pipelines…</div>
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
                  <span className="pipeline__count muted">{p.statuses.length} statuses</span>
                </label>
              );
            })}
            {selectedPipelines.size === 0 && pipelines.length > 0 && (
              <div className="muted" style={{ padding: '6px 0 0' }}>
                No pipelines selected — all leads will be checked.
              </div>
            )}
          </div>

          <div className="toggle-row">
            <span>Whose data wins</span>
            <select
              className="text-input"
              value={settings.advantage}
              disabled={saving}
              onChange={(e) => updateField({ advantage: e.target.value })}
            >
              <option value="newest">Newest lead</option>
              <option value="oldest">Oldest lead</option>
            </select>
          </div>

          <div className="toggle-row">
            <span>Keep lead by create date</span>
            <select
              className="text-input"
              value={settings.remainsStatus}
              disabled={saving}
              onChange={(e) => updateField({ remainsStatus: e.target.value })}
            >
              <option value="first">First created</option>
              <option value="last">Last created</option>
            </select>
          </div>

          <div className="toggle-row">
            <span>Check across different funnels</span>
            <Toggle
              checked={settings.isDifferentFunnelCheck}
              disabled={saving}
              onChange={(v) => updateField({ isDifferentFunnelCheck: v })}
            />
          </div>

          <div className="toggle-row">
            <span>Add tag instead of merging</span>
            <Toggle
              checked={settings.isTeg}
              disabled={saving}
              onChange={(v) => updateField({ isTeg: v })}
            />
          </div>

          {settings.isTeg && (
            <div className="toggle-row">
              <span>Tag name</span>
              <input
                type="text"
                className="text-input"
                value={settings.teg}
                disabled={saving}
                onChange={(e) => updateField({ teg: e.target.value })}
                placeholder="duplicate"
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
          {saving ? 'Saving…' : 'Save'}
        </button>
        {dirty && !saving && <span className="muted">You have unsaved changes</span>}
      </div>
    </div>
  );
}
