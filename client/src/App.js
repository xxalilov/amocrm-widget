import React, { useCallback, useEffect, useState } from 'react';
import './App.css';

import Tabs from './components/Tabs';
import FindDuplicatesTab from './tabs/FindDuplicatesTab';
import ContactSettingsTab from './tabs/ContactSettingsTab';
import LeadSettingsTab from './tabs/LeadSettingsTab';
import HistoryTab from './tabs/HistoryTab';
import { checkAuth, fetchAccountBySubdomain } from './api/account';

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
  const [subdomain, setSubdomain] = useState(() => detectSubdomain());
  const [account, setAccount] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [activeTab, setActiveTab] = useState('find');
  const [loadingAccount, setLoadingAccount] = useState(true);

  const verify = useCallback(async (sd) => {
    if (!sd) return;
    try {
      await checkAuth(sd);
      setAuthRequired(false);
      const acc = await fetchAccountBySubdomain(sd);
      setAccount(acc);
    } catch (err) {
      if (err.status === 401 || err.status === 404 || err.status === 400) {
        setAuthRequired(true);
      } else {
        console.error(err);
      }
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  useEffect(() => {
    if (!subdomain) {
      setLoadingAccount(false);
      return;
    }
    localStorage.setItem('amocrm_subdomain', subdomain);
    verify(subdomain);
  }, [subdomain, verify]);

  const handleAuth = () => {
    window.location.href = `/auth/install?subdomain=${encodeURIComponent(subdomain)}`;
  };

  if (!subdomain) {
    return <div className="app app--center">Cannot detect subdomain. Please reload the page.</div>;
  }
  if (loadingAccount) {
    return <div className="app app--center">Loading…</div>;
  }

  return (
    <div className="app">
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {authRequired && (
        <div className="auth-banner">
          <span>⚠️ Integration is not connected. Connect AmoCRM.</span>
          <button className="btn btn--primary" onClick={handleAuth} type="button">Connect AmoCRM</button>
        </div>
      )}

      <main className="app__content">
        {activeTab === 'find' && (
          <FindDuplicatesTab
            subdomain={subdomain}
            accountId={account?.id}
            onAuthRequired={() => setAuthRequired(true)}
          />
        )}
        {activeTab === 'contact' && <ContactSettingsTab accountId={account?.id} />}
        {activeTab === 'lead' && <LeadSettingsTab accountId={account?.id} subdomain={subdomain} />}
        {activeTab === 'history' && <HistoryTab accountId={account?.id} />}
      </main>
    </div>
  );
}
