import React from 'react';
import Toggle from './Toggle';

function formatWhen(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (e) {
    return null;
  }
}

// Background auto-merge controls (per entity type). The actual scanning + merging
// runs in the browser (widget script.js) on amoCRM's own merge, coordinated by the
// backend schedule — so it only progresses while amoCRM is open somewhere.
export default function AutoMergeSection({ settings, updateField, saving, status }) {
  const lastRun = formatWhen(status?.lastRunAt);
  const nextDue = formatWhen(status?.nextDueAt);

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

      <div className="muted" style={{ margin: '2px 0 10px', lineHeight: 1.4 }}>
        Виджет будет периодически сам находить и объединять дубликаты. Объединение
        выполняется штатным механизмом amoCRM в браузере, поэтому работает, пока
        amoCRM открыт хотя бы у одного сотрудника. Когда никто не работает в системе,
        проверка ставится на паузу и возобновляется автоматически.
      </div>

      {settings.autoMerge && (
        <>
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

          <div className="muted" style={{ marginTop: '4px' }}>
            {status?.running && <div>Идёт проверка…</div>}
            {!status?.running && lastRun && (
              <div>
                Последний запуск: {lastRun} — объединено групп: {status.lastMerged || 0}
                {status.lastFailed ? `, с ошибкой: ${status.lastFailed}` : ''}
              </div>
            )}
            {!status?.running && !lastRun && <div>Ещё не запускалось.</div>}
            {!status?.running && nextDue && <div>Следующая проверка после: {nextDue}</div>}
            {status?.lastError && (
              <div className="status-msg status-msg--error" style={{ marginTop: '6px' }}>
                Последняя ошибка: {status.lastError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
