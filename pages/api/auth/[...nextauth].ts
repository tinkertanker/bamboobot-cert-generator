import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import prisma from '@/lib/server/prisma';
import { detectUserTier, resetDailyUsageIfNeeded } from '@/lib/server/tiers';
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
    async jwt({ token, user, trigger }) {
      // On first sign in, attach user id and tier to token
      if (user) {
        // Cast user to include database fields
        const dbUser = user as typeof user & { id: string; tier?: UserTier };
        token.uid = dbUser.id;
        
        // Detect and set initial tier based on email
        const detectedTier = detectUserTier(user.email ?? null, dbUser.tier);
        token.tier = detectedTier;
        
        // Update tier in database if it changed
        await prisma.user.update({
          where: { id: dbUser.id },
          data: { 
            tier: detectedTier,
            lastActiveAt: new Date()
          }
        });
      }
      
      // On each session access, check if we need to refresh tier or reset usage
      if (trigger === 'update' || trigger === undefined) {
        if (token.uid) {
          // Reset daily usage if needed
          await resetDailyUsageIfNeeded(token.uid as string);
          
          // Get latest user data including tier and usage
          const currentUser = await prisma.user.findUnique({
            where: { id: token.uid as string },
            select: {
              tier: true,
              dailyPdfCount: true,
              dailyEmailCount: true,
              lastUsageReset: true
            }
          });
          
          if (currentUser) {
            token.tier = currentUser.tier as UserTier;
            token.dailyPdfCount = currentUser.dailyPdfCount;
            token.dailyEmailCount = currentUser.dailyEmailCount;
          }
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
