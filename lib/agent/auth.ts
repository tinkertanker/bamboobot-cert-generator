import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import prisma from '@/lib/server/prisma';
import { enforceRateLimit } from '@/lib/rate-limit';
import { AgentError } from './input';
import { digest } from './render';
import { logAgentError } from './log';

export const SCOPES = ['certificates:read', 'certificates:write'] as const;
export type AgentScope = typeof SCOPES[number];
export const DEFAULT_KEY_LIFETIME_DAYS = 30;
export const MAX_KEY_LIFETIME_DAYS = 3650;

export async function principal(req: NextApiRequest, res: NextApiResponse, scope: AgentScope, sessionOnly = false): Promise<string> {
  if (process.env.AGENT_CERTIFICATES_ENABLED !== 'true') throw new AgentError('Agent certificates are disabled', 404);
  let ownerId: string;
  if (req.headers.authorization) {
    if (sessionOnly) throw new AgentError('Owner browser approval is required; API keys cannot approve samples or manage keys', 403);
    const token = req.headers.authorization.match(/^Bearer (bb_[A-Za-z0-9_-]{43})$/)?.[1];
    const key = token ? await prisma.agentKey.findUnique({ where: { tokenHash: digest(token) } }) : null;
    if (!key || key.revokedAt || key.expiresAt <= new Date()) throw new AgentError('Invalid or expired API key', 401);
    if (!(key.scopes as string[]).includes(scope)) throw new AgentError('API key lacks the required scope', 403);
    ownerId = key.ownerId;
    await prisma.agentKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  } else {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) throw new AgentError('Sign in to continue', 401);
    ownerId = session.user.id;
    if (!['GET', 'HEAD'].includes(req.method ?? '')) {
      // Never derive the trusted origin from caller-controlled forwarded headers.
      const origin = process.env.NEXTAUTH_URL;
      let trustedOrigin: string;
      try { trustedOrigin = origin ? new URL(origin).origin : ''; }
      catch { throw new AgentError('Application origin is not configured correctly', 503); }
      if (!trustedOrigin || req.headers.origin !== trustedOrigin) throw new AgentError('Invalid request origin', 403);
      if (!req.headers['content-type']?.startsWith('application/json')) throw new AgentError('JSON requests are required', 415);
    }
  }
  if (!await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } })) throw new AgentError('Account not found', 401);
  if (!(await enforceRateLimit(req, res, { userId: ownerId, route: `agent:${req.method}`, category: req.method === 'GET' ? 'api' : 'generate' })).allowed) throw new AgentError('Too many requests', 429);
  return ownerId;
}

export async function createKey(ownerId: string, label: unknown, scopes: unknown, expiresInDays: unknown) {
  if (typeof label !== 'string' || !label.trim() || label.length > 100 || /[\u0000-\u001f\u007f\p{Cf}]/u.test(label) || !Array.isArray(scopes) || !scopes.length || scopes.some(s => !SCOPES.includes(s))) throw new AgentError('Supply a label and supported scopes');
  if (expiresInDays !== undefined && (typeof expiresInDays !== 'number' || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > MAX_KEY_LIFETIME_DAYS)) throw new AgentError(`Key lifetime must be a whole number of days, at most ${MAX_KEY_LIFETIME_DAYS}`);
  if (await prisma.agentKey.count({ where: { ownerId, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 10) throw new AgentError('At most 10 active API keys are allowed', 429);
  const token = `bb_${crypto.randomBytes(32).toString('base64url')}`;
  const days = typeof expiresInDays === 'number' ? expiresInDays : DEFAULT_KEY_LIFETIME_DAYS;
  const key = await prisma.agentKey.create({ data: { ownerId, label, scopes, tokenHash: digest(token), expiresAt: new Date(Date.now() + days * 86400000) } });
  return { token, key: { id: key.id, label: key.label, scopes: key.scopes, expiresAt: key.expiresAt, revokedAt: key.revokedAt, lastUsedAt: key.lastUsedAt } };
}

export function respondError(res: NextApiResponse, error: unknown) {
  if (error instanceof AgentError) res.status(error.status).json({ error: error.message });
  else {
    logAgentError('Agent API operation failed', error);
    res.status(500).json({ error: 'Certificate operation failed; please retry or contact the operator' });
  }
}
