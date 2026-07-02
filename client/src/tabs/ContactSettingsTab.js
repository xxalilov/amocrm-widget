import React, { useEffect, useState } from 'react';
import Toggle from '../components/Toggle';
import AutoMergeSection from '../components/AutoMergeSection';
import { fetchContactSettings, updateContactSettings } from '../api/settings';

const defaultSettings = {
  status: 'active',
  fields: 'phone',
  isFormatNumber: false,
  checkNumberLength: 9,
  isTeg: false,
  teg: '',
  addMergedTag: false,
  mergedTag: 'merged',
  autoMerge: false,
  autoInterval: 5,
  preventDuplicates: false,
};

export default function ContactSettingsTab() {
  const [settings, setSettings] = useState(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchContactSettings()
      .then((data) => { if (!cancelled) setSettings({ ...defaultSettings, ...data }); })
      .catch((err) => {
        if (err.status === 404) { if (!cancelled) setSettings(defaultSettings); }
        else console.error(err);
      })
      .finally(() => { if (!cancelled) { setLoading(false); setDirty(false); } });
    return () => { cancelled = true; };
  }, []);

  const updateField = (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    setStatusMsg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      // No on/off master toggle anymore — settings are always in effect.
      const saved = await updateContactSettings({ ...settings, status: 'active' });
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
        <span>Поле для сравнения</span>
        <select
          className="text-input"
          value={settings.fields}
          disabled={saving}
          onChange={(e) => updateField({ fields: e.target.value })}
        >
          <option value="phone">Телефон</option>
          <option value="email">Email</option>
          <option value="name">Имя</option>
        </select>
      </div>

      {settings.fields === 'phone' && (
        <>
          <div className="toggle-row">
            <span>Сравнивать только последние цифры номера</span>
            <Toggle
              checked={settings.isFormatNumber}
              disabled={saving}
              onChange={(v) => updateField({ isFormatNumber: v })}
            />
          </div>

          {settings.isFormatNumber && (
            <div className="toggle-row">
              <span>Сколько последних цифр сравнивать</span>
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

      <div className="toggle-row">
        <span><strong>Блокировать создание дублей</strong></span>
        <Toggle
          checked={!!settings.preventDuplicates}
          disabled={saving}
          onChange={(v) => updateField({ preventDuplicates: v })}
        />
      </div>

      <AutoMergeSection
        settings={settings}
        updateField={updateField}
        saving={saving}
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
