import React, { useEffect, useState } from 'react';
import './App.css';

import Tabs from './components/Tabs';
import FindDuplicatesTab from './tabs/FindDuplicatesTab';
import ContactSettingsTab from './tabs/ContactSettingsTab';
import LeadSettingsTab from './tabs/LeadSettingsTab';
import HistoryTab from './tabs/HistoryTab';
import { fetchMe } from './api/account';
import { setApiKey } from './api/client';

const TABS = [
  { id: 'find',     label: 'Find Duplicates' },
  { id: 'contact',  label: 'Contact Settings' },
  { id: 'lead',     label: 'Lead Settings' },
  { id: 'history',  label: 'History' },
];

function detectSubdomain() {
  const params = new URLSearchParams(window.location.search);
  const acc = params.get('account');
  if (acc) return acc;

  if (document.referrer) {
    try {
      const url = new URL(document.referrer);
      const parts = url.hostname.split('.');
      if (parts.length >= 2 && parts[parts.length - 2] + '.' + parts[parts.length - 1] === 'amocrm.ru') {
        return parts[0];
      }
    } catch (e) {}
  }
  if (window.AMOCRM?.widgets?.system?.domain) {
    return window.AMOCRM.widgets.system.domain;
  }
  return localStorage.getItem('amocrm_subdomain');
}

export default function App() {
  // The widget passes the API key via ?key=… ; persist it for in-app reloads.
  const [subdomain] = useState(() => detectSubdomain());
  const [account, setAccount] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [activeTab, setActiveTab] = useState('find');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (subdomain) localStorage.setItem('amocrm_subdomain', subdomain);

    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get('key');
    if (urlKey) setApiKey(urlKey);

    // Always ask the backend who we are: with a key in prod, or keyless in dev
    // (the backend allows it when APP_ENV=dev). A 401 means auth is required.
    fetchMe()
      .then((acc) => { setAccount(acc); setAuthRequired(false); })
      .catch((err) => {
        if (err.status === 401 || err.status === 404) setAuthRequired(true);
        else console.error(err);
      })
      .finally(() => setLoading(false));
  }, [subdomain]);

  const handleAuth = () => {
    window.location.href = `/auth/install?subdomain=${encodeURIComponent(subdomain || '')}`;
  };

  if (loading) {
    return <div className="app app--center">Loading…</div>;
  }

  if (authRequired || !account) {
    return (
      <div className="app app--center">
        <div className="auth-banner">
          <span>⚠️ This widget must be opened from amoCRM, and its API key must be set in the widget settings.</span>
          {subdomain && (
            <button className="btn btn--primary" onClick={handleAuth} type="button">Connect AmoCRM</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <main className="app__content">
        {activeTab === 'find' && (
          <FindDuplicatesTab onAuthRequired={() => setAuthRequired(true)} />
        )}
        {activeTab === 'contact' && <ContactSettingsTab />}
        {activeTab === 'lead' && <LeadSettingsTab />}
        {activeTab === 'history' && <HistoryTab />}
      </main>
    </div>
  );
}
