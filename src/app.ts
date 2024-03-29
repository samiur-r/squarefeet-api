import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import CookieParser from 'cookie-parser';

import morganMiddleware from './middlewares/MorganMiddleware';
import errorHandlingMiddleware from './middlewares/ErrorHandlingMiddleware';
import corsOptions from './config/corsOption';
import config from './config';

import userRoutes from './api/v1/users';
import otpRoutes from './api/v1/otps';
import transactionRoutes from './api/v1/transactions';
import agentRoutes from './api/v1/agents';
import postRoutes from './api/v1/posts';
import creditRoutes from './api/v1/credits';
import accountRoutes from './api/v1/account';
import searchRoutes from './api/v1/search';
import locationRoutes from './api/v1/locations';
import contentRoutes from './api/v1/content';
import adminRoutes from './api/v1/admin';
import commonRoutes from './api/v1/common';
import propertyTypesRoutes from './api/v1/property_types';

const app: Express = express();

app.use(CookieParser(config.cookieSecret));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors(corsOptions));
app.use(helmet());
app.use(morganMiddleware);

app.use('/api/v1/user', userRoutes);
app.use('/api/v1/otp', otpRoutes);
app.use('/api/v1/transaction', transactionRoutes);
app.use('/api/v1/agent', agentRoutes);
app.use('/api/v1/post', postRoutes);
app.use('/api/v1/credits', creditRoutes);
app.use('/api/v1/account', accountRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/page-content', contentRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/common', commonRoutes);
app.use('/api/v1/propertyTypes', propertyTypesRoutes);

app.use(errorHandlingMiddleware);

export default app;
