import React from 'react';

function formatLicense(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Header({ title, licenseUntil, onRefresh, onRenew }) {
  const licenseLabel = formatLicense(licenseUntil);
  return (
    <header className="app-header">
      <h1 className="app-header__title">{title}</h1>
      <div className="app-header__actions">
        {licenseLabel && (
          <div className="license-chip">
            <div className="license-chip__row">
              <span className="license-chip__label">License until {licenseLabel}</span>
              <button className="license-chip__refresh" onClick={onRefresh} type="button" aria-label="Refresh">↻</button>
            </div>
            <button className="license-chip__renew" onClick={onRenew} type="button">Renew</button>
          </div>
        )}
        <button className="btn btn--primary" type="button">
          <span className="btn__icon">✈</span> Updates & Cases
        </button>
        <button className="btn btn--dark" type="button">
          <span className="btn__icon">N</span> All NOVA widgets
        </button>
      </div>
    </header>
  );
}
