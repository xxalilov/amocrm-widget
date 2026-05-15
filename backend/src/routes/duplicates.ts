import { Router, Request, Response } from 'express';
import { loadTokens } from '../utils/tokeStorage';
import {
  searchContactsByPhone,
  searchLeadsByPhone,
  getAllContacts,
  getAllLeads,
  mergeContacts,
  mergeLeads,
  extractPhone,
  searchLeadsByName,
  groupLeadsByName
} from '../services/amoApi';
import { AmoEntity } from '../types';

const router = Router();

router.post('/search', async (req: Request, res: Response) => {
  const { type, phone, subdomain } = req.body;
  if (!phone || !subdomain) {
    return res.status(400).json({ error: 'phone and subdomain required' });
  }
  const tokens = loadTokens();
  const tokenData = tokens[subdomain];
  if (!tokenData || tokenData.expires_at < Date.now()) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', authUrl: `/auth/install?subdomain=${subdomain}` });
  }
  const accessToken = tokenData.access_token;

  try {
    let items: AmoEntity[] = [];
    if (type === 'contact') {
      items = await searchContactsByPhone(subdomain, phone, accessToken);
    } else if (type === 'lead') {
      items = await searchLeadsByPhone(subdomain, phone, accessToken);
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }
    items.sort((a, b) => b.updated_at - a.updated_at);
    res.json({ duplicates: items });
  } catch (err: any) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/find-all-duplicates', async (req: Request, res: Response) => {
  const { type, subdomain } = req.body;
  if (!subdomain) {
    return res.status(400).json({ error: 'subdomain required' });
  }
  const tokens = loadTokens();
  const tokenData = tokens[subdomain];
  if (!tokenData || tokenData.expires_at < Date.now()) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', authUrl: `/auth/install?subdomain=${subdomain}` });
  }
  const accessToken = tokenData.access_token;

  try {
    let allItems: AmoEntity[] = [];
    if (type === 'contact') {
      allItems = await getAllContacts(subdomain, accessToken);
    } else if (type === 'lead') {
      allItems = await getAllLeads(subdomain, accessToken);
    } else {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const groupsMap = new Map<string, AmoEntity[]>();
    for (const item of allItems) {
      const phone = extractPhone(item);
      if (!phone) continue;
      if (!groupsMap.has(phone)) groupsMap.set(phone, []);
      groupsMap.get(phone)!.push(item);
    }
    const resultGroups = [];
    for (const [phone, items] of groupsMap.entries()) {
      if (items.length > 1) {
        items.sort((a, b) => b.updated_at - a.updated_at);
        resultGroups.push({ phone, items });
      }
    }
    res.json({ groups: resultGroups });
  } catch (err: any) {
    console.error('Find all duplicates error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/merge', async (req: Request, res: Response) => {
  const { type, mainId, duplicateIds, subdomain } = req.body;
  if (!type || !mainId || !duplicateIds?.length || !subdomain) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  const tokens = loadTokens();
  const tokenData = tokens[subdomain];
  if (!tokenData || tokenData.expires_at < Date.now()) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', authUrl: `/auth/install?subdomain=${subdomain}` });
  }
  const accessToken = tokenData.access_token;

  try {
    if (type === 'contact') {
      await mergeContacts(subdomain, mainId, duplicateIds, accessToken);
      res.json({ success: true, message: 'Contacts merged' });
    } else if (type === 'lead') {
      await mergeLeads(subdomain, mainId, duplicateIds, accessToken);
      res.json({ success: true, message: 'Leads merged' });
    } else {
      res.status(400).json({ error: 'Invalid type' });
    }
  } catch (err: any) {
    console.error('Merge error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/search-leads-by-name', async (req: Request, res: Response) => {
  const { name, subdomain } = req.body;
  if (!name || !subdomain) {
    return res.status(400).json({ error: 'name and subdomain required' });
  }
  const tokens = loadTokens();
  const tokenData = tokens[subdomain];
  if (!tokenData || tokenData.expires_at < Date.now()) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', authUrl: `/auth/install?subdomain=${subdomain}` });
  }
  const accessToken = tokenData.access_token;

  try {
    const items = await searchLeadsByName(subdomain, name, accessToken);
    items.sort((a, b) => b.updated_at - a.updated_at);
    res.json({ duplicates: items });
  } catch (err: any) {
    console.error('Search by name error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/find-all-lead-duplicates-by-name', async (req: Request, res: Response) => {
  const { subdomain } = req.body;
  if (!subdomain) {
    return res.status(400).json({ error: 'subdomain required' });
  }
  const tokens = loadTokens();
  const tokenData = tokens[subdomain];
  if (!tokenData || tokenData.expires_at < Date.now()) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', authUrl: `/auth/install?subdomain=${subdomain}` });
  }
  const accessToken = tokenData.access_token;

  try {
    const allLeads = await getAllLeads(subdomain, accessToken);
    const groupsMap = groupLeadsByName(allLeads);
    const resultGroups = [];
    for (const [name, items] of groupsMap.entries()) {
      resultGroups.push({ name, items });
    }
    res.json({ groups: resultGroups });
  } catch (err: any) {
    console.error('Find all lead duplicates by name error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/check-auth', (req: Request, res: Response) => {
  const { subdomain } = req.query;
  if (!subdomain || typeof subdomain !== 'string') {
    return res.status(400).json({ error: 'subdomain required' });
  }
  const tokens = loadTokens();
  const tokenData = tokens[subdomain];
  if (!tokenData || tokenData.expires_at < Date.now()) {
    return res.json({ authed: false, authRequired: true });
  }
  res.json({ authed: true });
});

export default router;