import React, { useEffect, useState } from 'react';
import './App.css';

import Tabs from './components/Tabs';
import FindDuplicatesTab from './tabs/FindDuplicatesTab';
import ContactSettingsTab from './tabs/ContactSettingsTab';
import LeadSettingsTab from './tabs/LeadSettingsTab';
import HistoryTab from './tabs/HistoryTab';
import StatsTab from './tabs/StatsTab';
import { fetchMe } from './api/account';
import { setApiKey, setAccountContext, API_BASE } from './api/client';

const TABS = [
  { id: 'find',     label: 'Поиск дублей' },
  { id: 'contact',  label: 'Настройки контактов' },
  { id: 'lead',     label: 'Настройки сделок' },
  { id: 'history',  label: 'История' },
  { id: 'stats',    label: 'Статистика' },
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

// 'mini' = compact card in the marketplace settings popup (just key management);
// 'full' = the complete app (advanced-settings page / left-menu page).
function detectView() {
  return new URLSearchParams(window.location.search).get('view') === 'mini' ? 'mini' : 'full';
}

export default function App() {
  // The widget passes the API key via ?key=… ; persist it for in-app reloads.
  const [subdomain] = useState(() => detectSubdomain());
  const [view] = useState(() => detectView());
  const [account, setAccount] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [activeTab, setActiveTab] = useState('find');
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState(null);   // key returned by the Connect flow
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (subdomain) localStorage.setItem('amocrm_subdomain', subdomain);
    // Scope the stored key to THIS account before any key read/write, so we never
    // pick up another account's key from a shared browser (cross-account leak).
    setAccountContext(subdomain);

    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get('key');
    if (urlKey) setApiKey(urlKey);
    // Fallback when the OAuth tab redirects back here directly (popup blocked).
    const fresh = params.get('new_key');
    if (fresh) setNewKey(fresh);

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

  // Receive the freshly generated widget key from the OAuth popup (postMessage).
  useEffect(() => {
    function onMessage(e) {
      const data = e.data;
      if (data && data.type === 'amo_widget_key' && data.key) {
        setNewKey(data.key);
        setCopied(false);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleAuth = () => {
    const url = `${API_BASE}/auth/install?subdomain=${encodeURIComponent(subdomain || '')}`;
    // amoCRM's OAuth page can't load inside the amoCRM iframe, so open a popup.
    // The callback posts the key back here; if the popup is blocked, navigate.
    const popup = window.open(url, 'amo_oauth', 'width=600,height=720');
    if (!popup) window.location.href = url;
  };

  const copyKey = () => {
    if (!newKey) return;
    try { navigator.clipboard.writeText(newKey); setCopied(true); } catch (e) {}
  };

  const keyBox = newKey && (
    <div className="key-box">
      <p className="key-box__title">✅ Подключено! Ваш API-ключ:</p>
      <code className="key-box__value">{newKey}</code>
      <button className="btn btn--primary" onClick={copyKey} type="button">
        {copied ? 'Скопировано ✓' : 'Копировать'}
      </button>
      <p className="key-box__hint">
        Вставьте его в поле <strong>«API-ключ»</strong> выше и нажмите <strong>«Сохранить»</strong>.
      </p>
    </div>
  );

  if (loading) {
    return <div className="app app--center">Загрузка…</div>;
  }

  if (authRequired || !account) {
    return (
      <div className="app app--center">
        <div className="auth-banner">
          <span>⚠️ Этот виджет нужно открывать из amoCRM, а API-ключ — указать в настройках виджета.</span>
          {subdomain && !newKey && (
            <button className="btn btn--primary" onClick={handleAuth} type="button">Подключить amoCRM</button>
          )}
        </div>
        {keyBox}
      </div>
    );
  }

  // In the marketplace settings popup we only confirm the connection and point to
  // the full page (like other marketplace widgets), instead of cramming all the
  // tabs into the small popup.
  if (view === 'mini') {
    return (
      <div className="app app--center">
        <div className="connected-card">
          <p className="connected-card__title">✅ Подключено{account?.name ? ` — ${account.name}` : ''}</p>
          <p className="connected-card__hint">
            Откройте <strong>«Поиск и объединение дубликатов»</strong> в разделе{' '}
            <strong>Настройки</strong>, чтобы искать и объединять дубликаты.
          </p>
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
        {activeTab === 'stats' && <StatsTab />}
      </main>
    </div>
  );
}
