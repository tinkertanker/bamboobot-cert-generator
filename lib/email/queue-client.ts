import { getEnv } from '@/lib/cloudflare/env';

/**
 * Calls the user's bulk email queue Durable Object. Each user has one object,
 * addressed by their user ID.
 */
export async function callEmailQueue(
  userId: string,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {}
): Promise<Response> {
  const namespace = getEnv().EMAIL_QUEUE;
  if (!namespace) throw new Error('The EMAIL_QUEUE Durable Object binding is not configured');
  const stub = namespace.get(namespace.idFromName(userId));
  const response = await stub.fetch(`https://email-queue${path}`, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  // The Workers and DOM Response types differ only in iterator typings.
  return response as unknown as Response;
}
