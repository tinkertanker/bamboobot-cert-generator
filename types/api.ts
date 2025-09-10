// API types and extensions
import { NextApiRequest } from 'next';
import type { UserWithTier } from './user';

// Extended request with authenticated user
export interface AuthenticatedRequest extends NextApiRequest {
  user: UserWithTier;
}