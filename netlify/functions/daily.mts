import type { Config } from '@netlify/functions';
import { createProductionDeps, runDailyJobs } from '../../server/dist/netlify.js';

export default async () => {
  console.log(JSON.stringify(await runDailyJobs(createProductionDeps(process.env))));
};
export const config: Config = { schedule: '0 10 * * *' };
