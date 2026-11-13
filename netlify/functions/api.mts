import { handle } from 'hono/netlify';
import { createProductionApp } from '../../server/src/production';

export default handle(createProductionApp(process.env));
export const config = { path: '/api/*' };
