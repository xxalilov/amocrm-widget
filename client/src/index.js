import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import PrivacyPolicy from './PrivacyPolicy';

// Simple path-based routing (the SPA serves index.html for every path).
// /privacy → standalone privacy policy page; anything else → the widget app.
const path = window.location.pathname.replace(/\/+$/, '');
const isPrivacy = path === '/privacy' || path === '/privacy-policy';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(isPrivacy ? <PrivacyPolicy /> : <App />);