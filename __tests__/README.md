# Unit tests

Jest (jsdom) with React Testing Library. Dependencies come from `npm ci`; nothing extra to install.

```bash
npm test -- __tests__/lib/rate-limit.test.ts   # one file
npm test -- -t "rate limit"                    # tests whose name matches
npm run test:watch
npm test                                       # all Jest suites; builds run separately
npm test -- --coverage
npm run build                                  # Node application and PDF worker
```

CI runs the Node build before Jest so worker artifact tests inspect a fresh bundle.
It also runs the Cloudflare build and Wrangler packaging check; both build paths
remain required and must run sequentially because they share `.next`.

## Layout

| Folder | What it covers |
| --- | --- |
| `api/` | API routes in `pages/api/`, called with `node-mocks-http` requests |
| `components/` | Components, including `modals/`, `panels/` and `ui/` |
| `hooks/` | Hooks in `hooks/` |
| `lib/` | Server and shared library code, including `lib/email/` and `lib/pdf/` |
| `utils/` | Helpers in `utils/` |
| `fonts/` | Font files and `FONT_CAPABILITIES` |
| `pages/` | Page rendering |
| `middleware.test.ts` | Route gating in `middleware.ts` |
| `helpers/` | Shared helpers (`mock-local-storage.ts`, `silence-console.ts`); not test suites |
| `__mocks__/` | AWS SDK mocks, wired up in `jest.config.js` |

`jest.setup.js` sets test environment variables (for example `NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE=false`) and global stubs.

## Writing tests

- Import and exercise the real module. Do not copy the logic under test into the test file.
- Skip tests that only assert on mocks, echo props back, or test third-party libraries.
- Check the test reaches the code it claims to cover; a test that passes with the code removed is not testing anything.
- Mock at the edges (filesystem, network, AWS, Prisma), not the module under test.
