import React from 'react';
import Toggle from './Toggle';

// Background auto-merge controls (per entity type): on/off + the interval.
export default function AutoMergeSection({ settings, updateField, saving }) {
  return (
    <div className="auto-block">
      <div className="toggle-row">
        <span><strong>Автоматическое объединение</strong></span>
        <Toggle
          checked={!!settings.autoMerge}
          disabled={saving}
          onChange={(v) => updateField({ autoMerge: v })}
        />
      </div>

      {settings.autoMerge && (
        <div className="toggle-row">
          <span>Интервал между проверками (минуты)</span>
          <input
            type="number"
            min="1"
            className="number-input"
            value={settings.autoInterval}
            disabled={saving}
            onChange={(e) => updateField({ autoInterval: Math.max(1, Number(e.target.value) || 1) })}
          />
        </div>
      )}
    </div>
  );
}
