import prisma from '../lib/server/prisma';
import { cleanupJobs, runOneJob } from '../lib/agent/jobs';
import { logAgentError } from '../lib/agent/log';

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

async function main() {
  if (process.env.AGENT_CERTIFICATES_ENABLED !== 'true') {
    throw new Error('Set AGENT_CERTIFICATES_ENABLED=true to run the certificate worker');
  }
  let lastCleanup = 0;
  while (!stopping) {
    try {
      if (Date.now() - lastCleanup > 60_000) {
        lastCleanup = Date.now();
        try { await cleanupJobs(); }
        catch (e) { logAgentError('Agent cleanup failed; continuing job processing', e); }
      }
      if (await runOneJob()) continue;
    } catch (e) { logAgentError('Agent worker operation failed; retrying', e); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

main().catch(e => { logAgentError('Agent worker could not start', e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
