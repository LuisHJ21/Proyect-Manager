import type { Config } from '@netlify/functions';
import { createProductionDeps } from '../../server/src/production';
import { runDailyJobs } from '../../server/src/jobs/daily';

export default async () => {
  console.log(JSON.stringify(await runDailyJobs(createProductionDeps(process.env))));
};
export const config: Config = { schedule: '0 10 * * *' };
