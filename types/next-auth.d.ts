import { UserTier } from './user';

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      tier: UserTier;
      dailyPdfCount: number;
      dailyEmailCount: number;
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    tier?: UserTier;
    dailyPdfCount?: number;
    dailyEmailCount?: number;
  }
}