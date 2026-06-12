import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import database from './utils/database';
import errorMiddleware from './middlewares/error-handler';
import { authenticateWidget } from './middlewares/auth';
import { HttpException } from './exceptions/HttpException';


import authRoutes from './routes/auth';
import duplicateRoutes from './routes/duplicates';
import accountRoutes from './routes/account';
import contactSettingsRoutes from './routes/contact-settings';
import leadSettingsRoutes from './routes/lead-settings';
import pipelinesRoutes from './routes/pipelines';
import historyRoutes from './routes/history';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Restrict CORS to the configured app origin(s). The React client is served
// from this same origin (express.static below), so cross-origin access is only
// needed for explicitly allow-listed domains via CORS_ORIGIN (comma-separated).
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  }),
);
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../client/build')));

// /auth (OAuth install + callback) is the only public API surface — it's how an
// account bootstraps and receives its widget key. Everything else is gated by
// the widget key, which also identifies the account.
app.use('/auth', authRoutes);
app.use('/api', authenticateWidget, duplicateRoutes);
app.use('/accounts', authenticateWidget, accountRoutes);
app.use('/contact-settings', authenticateWidget, contactSettingsRoutes);
app.use('/lead-settings', authenticateWidget, leadSettingsRoutes);
app.use('/pipelines', authenticateWidget, pipelinesRoutes);
app.use('/history', authenticateWidget, historyRoutes);
app.get('/:account', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/build', 'index.html'));
});
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