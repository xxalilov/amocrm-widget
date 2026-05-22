import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import database from './utils/database';
import errorMiddleware from './middlewares/error-handler';
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

database();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../client/build')));

app.use('/auth', authRoutes);
app.use('/api', duplicateRoutes);
app.use('/accounts', accountRoutes);
app.use('/contact-settings', contactSettingsRoutes);
app.use('/lead-settings', leadSettingsRoutes);
app.use('/pipelines', pipelinesRoutes);
app.use('/history', historyRoutes);
app.get('/:account', (req, res) => {
  res.sendFile(path.join(__dirname, '../../client/build', 'index.html'));
});
app.all('/*splat', (req, res) => {
  throw new HttpException(404, 'Not found');
});

app.use(errorMiddleware);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});