jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('../../pages/api/auth/[...nextauth]', () => ({ __esModule: true, authOptions: {}, default: jest.fn() }));

import { fireEvent, render, screen } from '@testing-library/react';
import type { GetServerSidePropsContext } from 'next';
import { getServerSession } from 'next-auth/next';
import { signIn } from 'next-auth/react';
import MarketingPage, { getServerSideProps } from '@/pages/index';

const context = (callbackUrl?: string) => ({
  req: {}, res: {}, query: callbackUrl === undefined ? {} : { callbackUrl },
} as unknown as GetServerSidePropsContext);

describe('landing page return path', () => {
  beforeEach(() => jest.clearAllMocks());

  it('signs in to the requested agent job and sends signed-in visitors straight there', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const result = await getServerSideProps(context('/agent?job=job-1'));
    expect(result).toEqual({ props: expect.objectContaining({ callbackUrl: '/agent?job=job-1' }) });

    render(<MarketingPage {...(result as { props: { authRequired: boolean; callbackUrl: string } }).props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(signIn).toHaveBeenCalledWith('google', { callbackUrl: '/agent?job=job-1' });

    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'owner' } });
    expect(await getServerSideProps(context('/agent?job=job-1')))
      .toEqual({ redirect: { destination: '/agent?job=job-1', permanent: false } });
  });

  it.each([
    undefined, 'https://evil.example/agent', '//evil.example/agent', '/\\evil.example/agent',
    'javascript:alert(1)', '/', '/?callbackUrl=%2F',
  ])('opens the editor instead of unsafe or looping return path %p', async callbackUrl => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'owner' } });
    expect(await getServerSideProps(context(callbackUrl)))
      .toEqual({ redirect: { destination: '/app', permanent: false } });
  });
});
