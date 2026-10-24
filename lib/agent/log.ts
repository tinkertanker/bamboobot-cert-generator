import { error } from '@/lib/log';

/** Never log messages/stacks: they can contain recipient data, SQL or paths. */
export function logAgentError(context: string, cause: unknown) {
  const name = cause instanceof Error ? cause.constructor.name : 'UnknownError';
  const code = (cause as { code?: unknown } | null)?.code;
  error(context, {
    name: /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : 'Error',
    code: typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,31}$/.test(code) ? code : 'UNKNOWN',
  });
}
