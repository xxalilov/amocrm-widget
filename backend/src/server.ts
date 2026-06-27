import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import database from './utils/database';
import errorMiddleware from './middlewares/error-handler';
import { authenticateWidget } from './middlewares/auth';
import { HttpException } from './exceptions/HttpException';


import authRoutes from './routes/auth';
import { AMO_ORIGIN_RE } from './controllers/auth';
import duplicateRoutes from './routes/duplicates';
import autoRoutes from './routes/auto';
import accountRoutes from './routes/account';
import contactSettingsRoutes from './routes/contact-settings';
import leadSettingsRoutes from './routes/lead-settings';
import companySettingsRoutes from './routes/company-settings';
import pipelinesRoutes from './routes/pipelines';
import historyRoutes from './routes/history';
import statsRoutes from './routes/stats';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: allow the configured app origin(s) (the SPA, served same-origin or as a
// split nginx image) PLUS any amoCRM/Kommo account origin. The latter is needed
// because the widget's script.js — running on the customer's amoCRM page — calls
// the API directly for the background auto-merge loop (and key fetch). Allowing
// the origin is not a security boundary: every route is still gated by the
// widget key / subdomain in authenticateWidget.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin / non-browser clients
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (AMO_ORIGIN_RE.test(origin)) return cb(null, true);
      cb(null, false);
    },
  }),
);
app.use(express.json());

// /auth (OAuth install + callback) is the only public API surface — it's how an
// account bootstraps and receives its widget key. Everything else is gated by
// the widget key, which also identifies the account.
app.use('/auth', authRoutes);
app.use('/api', authenticateWidget, duplicateRoutes);
// Background auto-merge surface, called by the widget's script.js from the
// amoCRM page (claim a run, scan, poll, log merges, complete) + a status read
// for the SPA settings UI.
app.use('/auto', authenticateWidget, autoRoutes);
app.use('/accounts', authenticateWidget, accountRoutes);
app.use('/contact-settings', authenticateWidget, contactSettingsRoutes);
app.use('/lead-settings', authenticateWidget, leadSettingsRoutes);
app.use('/company-settings', authenticateWidget, companySettingsRoutes);
app.use('/pipelines', authenticateWidget, pipelinesRoutes);
app.use('/history', authenticateWidget, historyRoutes);
app.use('/stats', authenticateWidget, statsRoutes);

// Liveness probe for the container/orchestrator (no auth, no DB call).
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Serve the built SPA only when this image actually ships client/build
// (unified deployment). In the split deployment the SPA lives in a separate
// nginx image, so the backend image has no client/build and we skip this —
// non-API paths then 404 cleanly.
const clientBuild = path.join(__dirname, '../../client/build');
if (fs.existsSync(path.join(clientBuild, 'index.html'))) {
  app.use(express.static(clientBuild));
  app.get('/:account', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

app.all('/*splat', (req, res) => {
  throw new HttpException(404, 'Not found');
});

app.use(errorMiddleware);

// Connect & sync the database before accepting traffic, so early requests
// don't hit an unready connection pool.
database()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });