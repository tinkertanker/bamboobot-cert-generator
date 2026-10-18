// Jest stand-in for the ESM-only @prisma/adapter-d1 package. Tests mock the
// Prisma client itself, so the adapter is never used.
export class PrismaD1 {
  constructor(public readonly binding: unknown) {}
}
