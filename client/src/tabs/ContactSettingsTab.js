import React, { useEffect, useState } from 'react';
import Toggle from '../components/Toggle';
import { fetchContactSettings, updateContactSettings } from '../api/settings';

const defaultSettings = {
  status: 'inactive',
  fields: 'phone',
  isFormatNumber: false,
  checkNumberLength: 9,
  isTeg: false,
  teg: '',
};

export default function ContactSettingsTab({ accountId }) {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setLoading(true);
    fetchContactSettings(accountId)
      .then((data) => { if (!cancelled) setSettings({ ...defaultSettings, ...data }); })
      .catch((err) => {
        if (err.status === 404) { if (!cancelled) setSettings(defaultSettings); }
        else console.error(err);
      })
      .finally(() => { if (!cancelled) { setLoading(false); setDirty(false); } });
    return () => { cancelled = true; };
  }, [accountId]);

  const updateField = (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setStatusMsg(null);
  };

  const handleSave = async () => {
    if (!accountId) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const saved = await updateContactSettings(accountId, settings);
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
      <div className="toggle-row toggle-row--master">
        <span><strong>Enable contact settings</strong></span>
        <Toggle
          checked={settings.status === 'active'}
          disabled={saving}
          onChange={(v) => updateField({ status: v ? 'active' : 'inactive' })}
        />
      </div>

      {settings.status === 'active' && (
        <>
          <div className="toggle-row">
            <span>Comparison field</span>
            <select
              className="text-input"
              value={settings.fields}
              disabled={saving}
              onChange={(e) => updateField({ fields: e.target.value })}
            >
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="name">Name</option>
            </select>
          </div>

          {settings.fields === 'phone' && (
            <>
              <div className="toggle-row">
                <span>Normalize phone number before comparison</span>
                <Toggle
                  checked={settings.isFormatNumber}
                  disabled={saving}
                  onChange={(v) => updateField({ isFormatNumber: v })}
                />
              </div>

              {settings.isFormatNumber && (
                <div className="toggle-row">
                  <span>Phone digits to check (last N)</span>
                  <input
                    type="number"
                    className="number-input"
                    value={settings.checkNumberLength}
                    disabled={saving}
                    onChange={(e) => updateField({ checkNumberLength: Number(e.target.value) })}
                  />
                </div>
              )}
            </>
          )}

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
