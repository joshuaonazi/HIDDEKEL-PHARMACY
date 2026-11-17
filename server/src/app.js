import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const app = express();

app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', env.trustProxy);
app.use(helmet());
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json({ limit: '2mb' })); // large enough for a 2,000-row product import
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
