import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '@/lib/server/prisma';
import { resetDailyUsageIfNeeded, syncUserTier } from '@/lib/server/tiers';
import type { UserTier } from '@/types/user';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      // On first sign in, attach user id to the token. The tier is resolved
      // below, on sign-in and on every session check, so an admin removed from
      // SUPER_ADMIN_EMAILS / ADMIN_DOMAINS loses the tier without signing out.
      if (user) {
        const dbUser = user as typeof user & { id: string };
        token.uid = dbUser.id;
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { lastActiveAt: new Date() }
        });
      }

      if (token.uid) {
        // Reset daily usage if needed
        await resetDailyUsageIfNeeded(token.uid as string);

        const currentUser = await prisma.user.findUnique({
          where: { id: token.uid as string },
          select: {
            id: true,
            email: true,
            tier: true,
            tierSource: true,
            dailyPdfCount: true,
            dailyEmailCount: true
          }
        });

        if (currentUser) {
          token.tier = await syncUserTier(currentUser);
          token.dailyPdfCount = currentUser.dailyPdfCount;
          token.dailyEmailCount = currentUser.dailyEmailCount;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.sub) {
        // Type-safe session user updates
        const sessionUser = session.user as typeof session.user & {
          id: string;
          tier: UserTier;
          dailyPdfCount: number;
          dailyEmailCount: number;
        };
        sessionUser.id = token.uid as string ?? token.sub;
        sessionUser.tier = (token.tier as UserTier) || 'free';
        sessionUser.dailyPdfCount = (token.dailyPdfCount as number) || 0;
        sessionUser.dailyEmailCount = (token.dailyEmailCount as number) || 0;
      }
      return session;
    },
    async signIn({ account, profile }) {
      // Admin tiers are granted from the email address (SUPER_ADMIN_EMAILS /
      // ADMIN_DOMAINS), so only accept addresses the provider has verified.
      // Tier detection itself happens in the jwt callback on first sign-in.
      if (account?.provider === 'google') {
        return (profile as { email_verified?: boolean } | undefined)?.email_verified === true;
      }
      return true;
    }
  },
  pages: {
    signIn: '/', // marketing page shows Sign in CTA
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
