jest.mock('@/lib/server/middleware/featureGate', () => ({
  withFeatureGate: (_options: unknown, handler: unknown) => handler
}));
jest.mock('@/lib/auth/requireAuth', () => ({ requireAuth: jest.fn() }));

import { config as sendEmailConfig } from '@/pages/api/send-email';
import { config as sendTestEmailConfig } from '@/pages/api/send-test-email';

describe('client PDF email body limits', () => {
  it('allow base64 expansion for the 25 MiB decoded PDF limit', () => {
    expect(sendEmailConfig.api.bodyParser.sizeLimit).toBe('40mb');
    expect(sendTestEmailConfig.api.bodyParser.sizeLimit).toBe('40mb');
  });
});
