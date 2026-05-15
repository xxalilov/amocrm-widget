import React, { useState, useEffect } from 'react';
import './App.css';

const DEFAULT_SUBDOMAIN = 'upsofttest13';

function App() {
  const [type, setType] = useState('contact');
  const [searchTerm, setSearchTerm] = useState('');
  const [duplicates, setDuplicates] = useState([]);
  const [selectedMainId, setSelectedMainId] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [subdomain] = useState(DEFAULT_SUBDOMAIN);
  const [loading, setLoading] = useState(false);
  const [allDuplicateGroups, setAllDuplicateGroups] = useState([]);
  const [activeMode, setActiveMode] = useState('search');
  const [selectedMainForGroup, setSelectedMainForGroup] = useState({});

  useEffect(() => {
    checkAuth();
    const interval = setInterval(checkAuth, 60000);
    return () => clearInterval(interval);
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch(`/api/check-auth?subdomain=${subdomain}`);
      const data = await res.json();
      setAuthRequired(!data.authed);
    } catch (err) {
      console.error('Auth check failed', err);
      setAuthRequired(true);
    }
  };

  useEffect(() => {
    if (allDuplicateGroups.length === 0) return;
    const newSelected = { ...selectedMainForGroup };
    let changed = false;
    for (const group of allDuplicateGroups) {
      const key = group.phone || group.name;
      if (!newSelected[key]) {
        newSelected[key] = group.items[0]?.id;
        changed = true;
      }
    }
    if (changed) setSelectedMainForGroup(newSelected);
  }, [allDuplicateGroups]);

  const searchContactsByPhone = async () => {
    if (!searchTerm.trim()) return alert('Enter phone number');
    setLoading(true);
    setActiveMode('search');
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contact', phone: searchTerm, subdomain })
      });
      if (res.status === 401) { setAuthRequired(true); setLoading(false); return; }
      const data = await res.json();
      if (data.duplicates) {
        setDuplicates(data.duplicates);
        if (data.duplicates.length > 0) setSelectedMainId(data.duplicates[0].id);
        setAllDuplicateGroups([]);
      } else alert(data.error || 'Search failed');
    } catch (err) { alert('Network error: ' + err.message); }
    finally { setLoading(false); }
  };

  const findAllContactDuplicates = async () => {
    setLoading(true);
    setActiveMode('findAll');
    try {
      const res = await fetch('/api/find-all-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contact', subdomain })
      });
      if (res.status === 401) { setAuthRequired(true); setLoading(false); return; }
      const data = await res.json();
      if (data.groups) {
        setAllDuplicateGroups(data.groups);
        setDuplicates([]);
      } else alert(data.error || 'Failed');
    } catch (err) { alert('Network error: ' + err.message); }
    finally { setLoading(false); }
  };

  const searchLeadsByName = async () => {
    if (!searchTerm.trim()) return alert('Enter lead name');
    setLoading(true);
    setActiveMode('search');
    try {
      const res = await fetch('/api/search-leads-by-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: searchTerm, subdomain })
      });
      if (res.status === 401) { setAuthRequired(true); setLoading(false); return; }
      const data = await res.json();
      if (data.duplicates) {
        setDuplicates(data.duplicates);
        if (data.duplicates.length > 0) setSelectedMainId(data.duplicates[0].id);
        setAllDuplicateGroups([]);
      } else alert(data.error || 'Search failed');
    } catch (err) { alert('Network error: ' + err.message); }
    finally { setLoading(false); }
  };

  const findAllLeadDuplicatesByName = async () => {
    setLoading(true);
    setActiveMode('findAll');
    try {
      const res = await fetch('/api/find-all-lead-duplicates-by-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain })
      });
      if (res.status === 401) { setAuthRequired(true); setLoading(false); return; }
      const data = await res.json();
      if (data.groups) {
        setAllDuplicateGroups(data.groups);
        setDuplicates([]);
      } else alert(data.error || 'Failed');
    } catch (err) { alert('Network error: ' + err.message); }
    finally { setLoading(false); }
  };

  const mergeSelected = async () => {
    if (!selectedMainId) return alert('Select main item');
    const dupIds = duplicates.filter(d => d.id !== selectedMainId).map(d => d.id);
    if (dupIds.length === 0) return;
    if (!window.confirm(`Merge ${dupIds.length} items into ${selectedMainId}?`)) return;
    try {
      const res = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, mainId: selectedMainId, duplicateIds: dupIds, subdomain })
      });
      const data = await res.json();
      if (data.success) {
        alert('Merged successfully!');
        if (type === 'contact') searchContactsByPhone();
        else searchLeadsByName();
      } else alert('Merge failed: ' + data.error);
    } catch (err) { alert('Merge error: ' + err.message); }
  };

  const mergeSingleGroup = async (items, groupKey) => {
    const mainId = selectedMainForGroup[groupKey];
    if (!mainId) { alert('Select main item'); return; }
    const dupIds = items.filter(i => i.id !== mainId).map(i => i.id);
    if (dupIds.length === 0) return;
    if (!window.confirm(`Merge group "${groupKey}"?`)) return;
    try {
      const res = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, mainId, duplicateIds: dupIds, subdomain })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Group "${groupKey}" merged`);
        if (type === 'contact') findAllContactDuplicates();
        else findAllLeadDuplicatesByName();
      } else alert('Merge failed: ' + data.error);
    } catch (err) { alert('Merge error: ' + err.message); }
  };

  const mergeAllGroups = async () => {
    if (!window.confirm('Merge all groups automatically? (latest updated as main)')) return;
    for (const group of allDuplicateGroups) {
      const items = group.items;
      const sorted = [...items].sort((a,b) => b.updated_at - a.updated_at);
      const mainId = sorted[0].id;
      const dupIds = sorted.slice(1).map(i => i.id);
      if (dupIds.length === 0) continue;
      try {
        await fetch('/api/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, mainId, duplicateIds: dupIds, subdomain })
        });
      } catch(e) { console.error(e); }
    }
    alert('All groups merged');
    if (type === 'contact') findAllContactDuplicates();
    else findAllLeadDuplicatesByName();
  };

  const handleAuth = () => { window.location.href = `/auth/install?subdomain=${subdomain}`; };

  const formatDate = (ts) => new Date(ts * 1000).toLocaleString();
  const getName = (item) => {
    if (item.name) return item.name;
    if (type === 'contact') return `${item.first_name || ''} ${item.last_name || ''}`.trim() || `Contact #${item.id}`;
    return `Lead #${item.id}`;
  };

  const renderDuplicateList = (items) => (
    <div>
      <h3>Found {items.length} duplicate(s)</h3>
      {items.map(item => (
        <div key={item.id} className="duplicate-item">
          <input type="radio" name="mainGroup" checked={selectedMainId === item.id} onChange={() => setSelectedMainId(item.id)} />
          <div><div className="duplicate-name">{getName(item)}</div><div className="duplicate-date">ID: {item.id} | Updated: {formatDate(item.updated_at)}</div></div>
        </div>
      ))}
      <button className="merge-btn" onClick={mergeSelected}>Merge selected</button>
    </div>
  );

  const renderGroups = () => (
    <div>
      <h3>Found {allDuplicateGroups.length} duplicate groups</h3>
      <button onClick={mergeAllGroups} style={{ background: '#ef4444', marginBottom: 20 }}>Merge ALL groups</button>
      {allDuplicateGroups.map(group => {
        const groupKey = group.phone || group.name;
        const items = group.items;
        return (
          <div key={groupKey} className="group-container">
            <h4>{groupKey}</h4>
            {items.map(item => (
              <div key={item.id} className="duplicate-item">
                <input type="radio" name={`group_${groupKey}`} checked={selectedMainForGroup[groupKey] === item.id} onChange={() => setSelectedMainForGroup(prev => ({ ...prev, [groupKey]: item.id }))} />
                <div><div className="duplicate-name">{getName(item)}</div><div className="duplicate-date">ID: {item.id} | Updated: {formatDate(item.updated_at)}</div></div>
              </div>
            ))}
            <button onClick={() => mergeSingleGroup(items, groupKey)} className="merge-btn" style={{ marginTop: 8 }}>Merge this group</button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="app">
      <h1>🔍 Duplicate Finder & Merger</h1>
      <div className="tabs">
        <button className={`tab ${type === 'contact' ? 'active' : ''}`} onClick={() => { setType('contact'); setDuplicates([]); setAllDuplicateGroups([]); }}>Contacts</button>
        <button className={`tab ${type === 'lead' ? 'active' : ''}`} onClick={() => { setType('lead'); setDuplicates([]); setAllDuplicateGroups([]); }}>Leads</button>
      </div>

      {authRequired && (
        <div className="auth-banner">
          <span>⚠️ Integration not connected. Authorize AmoCRM.</span>
          <button onClick={handleAuth}>Connect AmoCRM</button>
        </div>
      )}

      <div className="search-form">
        <input type="text" placeholder={type === 'contact' ? 'Phone number' : 'Lead name'} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        {type === 'contact' ? (
          <button onClick={searchContactsByPhone} disabled={loading}>Find by phone</button>
        ) : (
          <button onClick={searchLeadsByName} disabled={loading}>Find by name</button>
        )}
        {type === 'contact' ? (
          <button onClick={findAllContactDuplicates} disabled={loading} style={{ background: '#8b5cf6' }}>Find all duplicates</button>
        ) : (
          <button onClick={findAllLeadDuplicatesByName} disabled={loading} style={{ background: '#8b5cf6' }}>Find all by name</button>
        )}
      </div>

      {activeMode === 'search' && duplicates.length > 0 && renderDuplicateList(duplicates)}
      {activeMode === 'findAll' && allDuplicateGroups.length > 0 && renderGroups()}
      {activeMode === 'findAll' && allDuplicateGroups.length === 0 && !loading && <p>✅ No duplicates found.</p>}
    </div>
  );
}

export default App;