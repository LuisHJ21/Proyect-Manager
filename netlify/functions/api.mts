import { handle } from 'hono/netlify';
import { createProductionApp } from '../../server/dist/netlify.js';

export default handle(createProductionApp(process.env));
export const config = { path: '/api/*' };
