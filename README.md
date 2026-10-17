# Bamboobot Certificate Generator

Generate beautiful, personalised certificates from an image background with drag‑and‑drop text fields, rich formatting, and bulk PDF/email workflows. Includes Google sign‑in with route gating, user tiers, optional server persistence (Prisma + SQLite) and an admin area.

## Key Features

### Core Functionality
- **Certificate Image Upload** - JPG/PNG with automatic PDF conversion
- **Drag-and-Drop Text Positioning** - Precision placement with visual feedback and keyboard nudging
- **Advanced Text Formatting** - 10 fonts, bold/italic, color picker, alignment controls
- **Flexible Text Sizing** - Shrink-to-fit for single lines or multi-line (2 lines) with word wrap
- **Adjustable Text Width** - Control text field width (10-90%) with visual feedback
- **Bulk Data Import** - TSV/CSV support with automatic header detection
- **Smart Entry Navigation** - Previous/Next/First/Last with entry counter

### Performance & Optimization
- **Client-Side PDF Generation** - Fast, browser-based PDF creation (with server-side fallback)
- **Table Virtualization** - Handles 400+ row datasets efficiently
- **Search & Filter** - Natural language search with `column:value` syntax
- **Progressive Generation** - Batch processing with pause/resume/cancel for large datasets

### Project Management
- **Complete Project System** - Save/load projects including certificate image and all certificate data
- **Project Autosave** - Smart autosave that updates existing projects without creating duplicates
- **Project Management** - Inline rename, relative timestamps ("2 hours ago"), mass delete
- **Background Image Replacement** - Replace certificate image while preserving text field positions

### Authentication & Access Control
- **Google Sign‑in (NextAuth)** with JWT sessions
- **Route Gating** via the server-only runtime setting `REQUIRE_AUTH=true` (everything except `/` + static assets)
- **Marketing Landing** at `/`; signed‑in users redirect to `/app`

### Persistence & Migration
- **Projects in the browser by default**, stored in localStorage and scoped to the signed-in account
- **Optional Server Persistence** with Prisma + SQLite when `NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE=true` at build time; signed-in users are then offered an import of projects saved in the browser

### Distribution & Delivery
- **Multiple Download Options** - Individual PDFs, single combined PDF, or ZIP archives
- **Email Delivery** - Multi-provider support (Resend/SES) with preview and retry logic
- **Cloud Storage** - Optional R2/S3 integration with CDN and lifecycle management
- **Bulk Operations** - Email all certificates with progress tracking

### Developer Features
- **Dev Mode** - Quick testing with pre-loaded certificate and data
- **Storage Monitoring** - Real-time localStorage and file system monitoring with one-click cleanup
- **Docker Support** - Production-ready containerization
- **Keyboard Shortcuts** - Ctrl/Cmd+B (bold), Ctrl/Cmd+I (italic), ESC (dismiss modals)
- **Enhanced Loading States** - Shimmer effects and skeleton loaders

## Quick Start

### Local Development
```bash
git clone <repository-url>
cd bamboobot-cert-generator
npm install
cp .env.example .env  # then fill in Google OAuth and NEXTAUTH_SECRET
npx prisma db push  # initialise SQLite for NextAuth, tiers and projects
npm run dev
# Open http://localhost:3000
```

### Docker
```bash
# Production
docker-compose up -d

# Development with hot reload
docker-compose -f docker-compose.dev.yml up -d
```

## How to Use

1. **Upload Certificate** - Drag & drop a JPG/PNG image
2. **Add Data** - Paste TSV/CSV data (header row automatically detected)
3. **Position Text** - Drag text fields to desired positions
4. **Format Text** - Click fields to access formatting controls
   - Choose between "Shrink to Fit" or "Multi-line (2 Lines)" text modes
   - Adjust text field width using the slider (10-90%)
   - Apply font, style, size, alignment, and color settings
5. **Navigate Entries** - Use Previous/Next to preview different certificates  
6. **Configure Email** (Optional) - Set up sender info and custom message if email column detected
7. **Generate** - Create single PDF or individual PDFs
8. **Send/Download** - Email certificates or download as PDF/ZIP

## Authentication

- Set `REQUIRE_AUTH=true` to gate app pages and APIs behind login while keeping the public landing page available at `/`. This server-only setting is evaluated at runtime; production defaults to authentication enabled when it is omitted or invalid. Setting it to `false` removes the global middleware login wall, including from APIs; use it only in a trusted local environment. Only endpoints with their own authorization checks remain protected.
- Configure Google provider in `.env` and set `NEXTAUTH_SECRET`.
- The admin area at `/admin` is available to the `admin` and `super_admin` tiers. The older `/dashboard` page is gated separately by `ADMIN_EMAILS` (comma‑separated emails).
- Admin tiers come from `SUPER_ADMIN_EMAILS` and `ADMIN_DOMAINS`. Removing an email or domain drops that user back to free on their next request; tiers a super admin sets in `/admin/users` are kept.

Example env snippet:

```bash
REQUIRE_AUTH=true
NEXTAUTH_SECRET=replace-with-random-string
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...

# Admin access
ADMIN_EMAILS=you@example.com, teammate@example.com
```

## Private file storage

Persisted uploads and generated certificates live under `storage/` (or `LOCAL_STORAGE_DIR`), never under Next.js' `public/` directory. `npm start` and `npm run dev` automatically migrate legacy local files; `npm run migrate:storage` is also available for one-shot migrations. Docker keeps the existing `./data/*` host directories and remounts them at `/app/storage/*`, so no host-side copy is required.

Generated download links are signed capabilities that expire after 90 days. Set `NEXTAUTH_URL` to the public application origin so emailed links are absolute, and set `FILE_URL_SIGNING_SECRET` (or a strong `NEXTAUTH_SECRET`) consistently across instances. Previously emailed unsigned `/generated/...` links are intentionally invalidated because their guessable paths cannot be converted into secure capabilities retroactively.

## Dev Mode Features

In Dev Mode, you have access to additional monitoring and cleanup tools:

### Storage Monitoring
- **LocalStorage Monitor** - Track browser storage usage with breakdown by type
  - Real-time quota usage monitoring with visual warnings
  - One-click cleanup for old projects (>30 days) and email queues (>7 days)
  - Detailed breakdown showing largest items and storage distribution
  
- **Storage Monitor** - Monitor file system storage usage
  - Track generated PDFs and temporary images
  - Quick cleanup actions for large files (>1MB) and old files
  - Visual storage usage indicators with cleanup recommendations

### Automated Cleanup
- **Smart Detection** - Automatically identifies old files and storage issues
- **One-Click Actions** - Quick cleanup buttons for common scenarios
- **Detailed Breakdown** - View storage usage by file type and age
- **Safety Warnings** - Visual alerts for high storage usage

## Configuration

Configure cloud storage and email in `.env`.

### Email
- Email tab appears when email column detected in data
- Multi-provider support (Resend/Amazon SES)
- Bulk sending with progress tracking and retry logic
- Email preview before sending

```bash
# Resend (recommended)
RESEND_API_KEY=re_xxxxx_xxxxx

# OR Amazon SES
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_SES_REGION=us-east-1
```

### Cloud Storage (optional)
If neither R2 or S3 are specified, the app defaults to local storage. 

When using cloud storage (R2 or S3), files automatically expire:
- **Individual certificates**: 90 days (extended if emailed)
- **Bulk PDFs**: 7 days
- **Previews**: 24 hours

Note: projects are saved in the browser unless server persistence is enabled (see Persistence above).

```bash
# Cloudflare R2
STORAGE_PROVIDER=cloudflare-r2
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=bamboobot-certificates

# OR Amazon S3
STORAGE_PROVIDER=amazon-s3
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=xxxxx
S3_BUCKET_NAME=your-bucket-name
S3_REGION=us-east-1
```

## Development

### Commands
```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm start           # Start production server

# Testing & Linting
npm test            # Run all tests with Jest
npm run test:watch  # Run tests in watch mode
npm run test:e2e    # Run E2E tests (Playwright)
npm run test:e2e:headed  # Run E2E tests with browser visible
npm run test:e2e:ui      # Run E2E tests in interactive UI mode
npm run lint        # Run ESLint with Next.js configuration
npm run verify      # Start the dev server and check it responds
npm run test:r2-cleanup # Test R2 storage cleanup functionality

# Cleanup
npm run cleanup         # Clean all temporary files
npm run cleanup:old     # Delete old files (7+ days PDFs, 30+ days temp images)
npm run cleanup:old:dry # Preview what would be deleted without actually deleting
```

### Manual Cleanup
```bash
# Local Development
rm -rf storage/temp_images/* storage/generated/*

# Docker Production
rm -rf ./data/temp_images/* ./data/generated/*
docker-compose down && docker system prune -a
```

### Cloud Storage Cleanup (R2 / S3)
Expired files in Cloudflare R2 or Amazon S3 are deleted by a scheduled call to
`/api/cleanup-r2` or `/api/cleanup-s3`. Retention: previews 24 hours, bulk PDFs
7 days, individual certificates 90 days, emailed files and templates kept.

```bash
# Set CLEANUP_SECRET_KEY on the server and in the cron environment, then run daily:
0 2 * * * CLEANUP_BASE_URL=https://your-domain.com /path/to/scripts/storage-cleanup.sh

# Preview what would be deleted without deleting anything
CLEANUP_DRY_RUN=1 ./scripts/storage-cleanup.sh
```

### Docker Commands
```bash
# Production
docker-compose up -d      # Start
docker-compose logs -f    # View logs
docker-compose down       # Stop

# Development
docker-compose -f docker-compose.dev.yml up -d
```

## Project Structure

```
pages/
  ├── index.tsx               # Public marketing landing page
  ├── app.tsx                 # Authenticated application
  ├── _app.tsx                # App wrapper with fonts and AuthHeartbeat
  ├── admin/                  # Tier-gated admin area
  └── api/                    # API endpoints
components/
  ├── CertificatePreview.tsx  # Certificate display with drag positioning
  ├── VirtualizedTable.tsx    # Performance-optimised table for large datasets
  ├── LocalStorageMonitor.tsx # Dev Mode localStorage monitoring
  ├── StorageMonitor.tsx      # File system storage monitoring
  ├── panels/                 # Data, formatting, email config panels
  └── modals/                 # PDF generation, email, confirmation modals
hooks/                        # Feature-specific state management
lib/
  ├── auth/                   # Auth helpers (e.g., requireAuth)
  ├── pdf/                    # Shared layout core, browser worker, progressive queue
  ├── security/               # Signed download links, private file access
  ├── server/                 # Prisma client, user tiers, feature gate
  ├── storage/                # Account-scoped localStorage, expiry cleanup
  ├── email/                  # Email providers and queue system
  ├── r2-client.ts           # Cloudflare R2 integration
  ├── s3-client.ts           # Amazon S3 integration
  └── storage-config.ts      # Multi-provider storage
middleware.ts                 # Auth gating by env flag
prisma/
  └── schema.prisma          # SQLite models for NextAuth + Projects
types/                       # Shared TypeScript types (certificate, user, api)
utils/
  ├── styles.ts              # Color constants and theme
  └── textMeasurement.ts     # Text width calculation and line wrapping utilities
```

### Development Guidelines
See `AGENTS.md` for the full contributor guide (commands, architecture notes and pitfalls). In short:
- Shared types live in `types/`
- Use provider factory for email/storage, never hardcode
- Use `COLORS` constants from `utils/styles.ts`
- Extract complex UI into focused components
- **Coordinate System**: PDF uses bottom-left origin (0,0), UI uses top-left; conversion lives in `lib/pdf/shared/coordinate-transform.ts`

## Testing

The project includes comprehensive unit and end-to-end tests:

### Unit Tests (Jest + React Testing Library)
Tests organised by type:
- `__tests__/components/` - UI component tests
- `__tests__/api/` - API endpoint tests
- `__tests__/hooks/` - Hook tests
- `__tests__/lib/`, `__tests__/utils/` - Library and utility tests

```bash
npm test            # Run all tests with Jest
npm run test:watch  # Run tests in watch mode
npm test -- __tests__/path/to/specific.test.ts  # Run single test file
```

### End-to-End Tests (Playwright)
The E2E suite is not run in CI and predates the move of the editor to `/app`, so expect to update it before relying on it. See `e2e/README.md`.

```bash
npm run test:e2e        # Run all E2E tests (headless)
npm run test:e2e:headed # Run tests with browser visible
npm run test:e2e:ui     # Interactive UI mode
npm run test:e2e:debug  # Debug mode
```

The E2E tests cover:
- Dev Mode activation and certificate loading
- Text field interactions (drag, resize, format)
- PDF generation with formatting verification
- Entry navigation and data handling
- Email configuration and sending

## Technology Stack

- **Framework**: Next.js with TypeScript
- **Package Manager**: npm
- **UI**: Tailwind CSS
- **PDF**: pdf-lib (client-side and server-side)
- **Storage**: browser localStorage for projects (optional Prisma/SQLite persistence); Local/Cloudflare R2/Amazon S3 for files
- **Email**: Resend or Amazon SES
- **Testing**: Jest + React Testing Library + Playwright
- **Deployment**: Docker

## Font Licenses

All fonts (Helvetica, Times, Courier, Montserrat, Poppins, Source Sans Pro, Nunito, Great Vibes, Archivo, Rubik) are either system fonts or from Google Fonts, licensed under SIL Open Font License 1.1.

## About Bamboobot

Bamboobot inherits its name and icon from an early Tinkertanker PDF stamping project. Bamboo symbolizes growth, resilience, and continuous learning - qualities that certificates aim to recognize in learners and professionals.
