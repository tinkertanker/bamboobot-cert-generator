import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { principal, respondError } from '@/lib/agent/auth';
import { approveJob, retryJob, expireJob, ownedJob, describeJob, jobDir, type Manifest } from '@/lib/agent/jobs';
import { AgentError } from '@/lib/agent/input';
import { isWorkers, cloudflare } from '@/lib/server/cloudflare';
import type { WorkerCheckpoint } from '@/lib/agent/worker-jobs';
import { Readable } from 'stream';
import type { ReadableStream } from 'stream/web';

export const config = { api: { responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const approving = req.method === 'POST' && req.body?.action === 'approve';
    const ownerId = await principal(req, res, req.method === 'GET' ? 'certificates:read' : 'certificates:write', approving);
    if (typeof req.query.id !== 'string') throw new AgentError('Job id required');
    const id = req.query.id;
    if (req.method === 'POST') {
      const job = approving ? await approveJob(ownerId, id, req.body.inputHash) : req.body?.action === 'retry' ? await retryJob(ownerId, id) : null;
      if (!job) throw new AgentError('Unknown action');
      return res.json({ job: describeJob(job) });
    }
    if (req.method === 'DELETE') { await expireJob(ownerId, id); return res.json({ deleted: true }); }
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET, POST, DELETE'); return res.status(405).json({ error: 'Method not allowed; inputs are immutable' }); }
    const job = await ownedJob(ownerId, id);
    if (!req.query.artifact) return res.json({ job: describeJob(job) });
    if (req.query.artifact === 'input') {
      res.setHeader('Content-Disposition', 'attachment; filename="certificate-inputs.json"');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.json({ inputHash: job.inputHash, rendererVersion: job.rendererVersion, input: job.input });
    }
    if (isWorkers) {
      const state = job.checkpoint as unknown as WorkerCheckpoint;
      const manifest = job.status === 'completed' ? job.manifest as unknown as Manifest : null;
      let key: string | undefined;
      let filename: string;
      let mime: string;
      if (req.query.artifact === 'sample' || req.query.artifact === 'template') {
        key = req.query.artifact === 'sample' ? state.sampleKey : state.templateKey;
        filename = `${req.query.artifact}.pdf`; mime = 'application/pdf';
      } else {
        if (!manifest) throw new AgentError('Artifacts are unavailable until the entire batch is complete', 409);
        if (req.query.artifact === 'manifest') {
          res.setHeader('Content-Disposition', 'attachment; filename="manifest.json"');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          return res.json(manifest);
        }
        if (req.query.artifact === 'zip') {
          key = manifest.zip.objectKey; filename = 'certificates.zip'; mime = 'application/zip';
        } else if (req.query.artifact === 'file') {
          const index = Number(req.query.index);
          if (req.query.index === undefined || !Number.isSafeInteger(index) || index < 0 || index >= manifest.files.length) throw new AgentError('Unknown certificate', 404);
          key = manifest.files[index].objectKey; filename = manifest.files[index].filename; mime = 'application/pdf';
        } else throw new AgentError('Unknown artifact', 404);
      }
      if (!key) throw new AgentError('Sample is not ready; preparation continues without this browser', 409);
      const object = await cloudflare().env.FILES.get(key);
      if (!object) throw new AgentError('Artifact storage is unavailable; no incomplete batch will be substituted', 503);
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Length', String(object.size));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `${req.query.artifact === 'sample' ? 'inline' : 'attachment'}; filename="${filename}"`);
      await pipeline(Readable.fromWeb(object.body as unknown as ReadableStream), res);
      return;
    }
    let filePath: string;
    let filename: string;
    let mime: string;
    if (req.query.artifact === 'sample' || req.query.artifact === 'template') {
      filename = `${req.query.artifact}.pdf`;
      mime = 'application/pdf';
      filePath = path.join(jobDir(id), filename);
    } else {
      if (job.status !== 'completed' || !job.manifest) throw new AgentError('Artifacts are unavailable until the entire batch is complete', 409);
      const manifest = job.manifest as unknown as Manifest;
      const dir = path.join(jobDir(id), manifest.attempt);
      if (req.query.artifact === 'file') {
        const index = Number(req.query.index);
        if (!Number.isSafeInteger(index) || index < 0 || index >= manifest.files.length || req.query.index === undefined) throw new AgentError('Unknown certificate', 404);
        filename = manifest.files[index].filename; mime = 'application/pdf'; filePath = path.join(dir, `${index}.pdf`);
      } else if (req.query.artifact === 'zip') {
        filename = 'certificates.zip'; mime = 'application/zip'; filePath = path.join(dir, filename);
      } else if (req.query.artifact === 'manifest') {
        filename = 'manifest.json'; mime = 'application/json'; filePath = path.join(dir, filename);
      } else throw new AgentError('Unknown artifact', 404);
    }
    const stat = await fs.stat(filePath);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${req.query.artifact === 'sample' ? 'inline' : 'attachment'}; filename="${filename}"`);
    await pipeline(createReadStream(filePath), res);
  } catch (e) {
    if (res.headersSent) { res.destroy(); return; }
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return res.status(503).json({ error: 'Artifact storage is unavailable; no incomplete batch will be substituted' });
    respondError(res, e);
  }
}
