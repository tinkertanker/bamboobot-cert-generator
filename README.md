# Bamboobot Certificate Generator

A professional Next.js application for generating certificates from uploaded image templates. Upload an image, add draggable text fields, and generate bulk certificates from tabular data.

## Features

- **Image Template Upload** - JPG/PNG with automatic PDF conversion
- **Precision Text Positioning** - Drag-and-drop with visual feedback and keyboard nudging
- **Advanced Text Formatting** - 9 professional fonts, bold/italic, color picker, alignment controls
- **Keyboard Shortcuts** - Ctrl/Cmd+B (bold), Ctrl/Cmd+I (italic), ESC (dismiss modals)
- **Smart Entry Navigation** - Previous/Next/First/Last with entry counter  
- **Bulk Data Import** - TSV/CSV support with header toggle
- **Multiple Download Options** - Single PDF, individual PDFs, ZIP archives
- **Email Delivery** - Multi-provider support (Resend/SES) with preview, retry logic, and progress tracking
- **Live Preview** - Real-time preview matching final PDF output
- **Cloud Storage** - Multi-provider support (R2/S3) with CDN integration and lifecycle management
- **Docker Support** - Production-ready containerization
- **Dev Mode** - Quick testing with pre-loaded template, data, and email configuration

## Quick Start

### Local Development
```bash
git clone <repository-url>
cd bamboobot-cert-generator
npm install
npm run dev
# Open http://localhost:3000
```

### Docker (Production)
```bash
docker-compose up -d
# Access at http://localhost:3000
```

## How to Use

1. **Upload Template** - Drag & drop a JPG/PNG image
2. **Add Data** - Paste TSV/CSV data (toggle header option if needed)
3. **Position Text** - Drag text fields to desired positions
4. **Format Text** - Click fields to access formatting controls
5. **Navigate Entries** - Use Previous/Next to preview different certificates  
6. **Configure Email** (Optional) - Set up sender info and custom message if email column detected
7. **Generate** - Create single PDF or individual PDFs
8. **Send/Download** - Email certificates or download as PDF/ZIP

## Configuration

The application supports multiple providers for both storage and email delivery. Configure your preferred options in `.env.local`:

### Storage Providers

Choose between local storage or cloud storage with automatic file lifecycle management:

**Option 1: Local Storage (Default)**
```bash
# No configuration needed - works out of the box
# Files stored in public/ directory
```

**Option 2: Cloudflare R2 (Recommended)**
```bash
STORAGE_PROVIDER=cloudflare-r2
R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=bamboobot-certificates
R2_PUBLIC_URL=https://your-custom-domain.com  # Optional CDN
```

**Option 3: Amazon S3**
```bash
STORAGE_PROVIDER=amazon-s3
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=xxxxx
S3_BUCKET_NAME=your-bucket-name
S3_REGION=us-east-1
S3_CLOUDFRONT_URL=https://d1234567890.cloudfront.net  # Optional CDN
```

### Email Providers

The app auto-detects which provider to use based on configured environment variables:

**Option 1: Resend (Recommended for simplicity)**
```bash
RESEND_API_KEY=re_xxxxx_xxxxx
EMAIL_FROM=noreply@yourdomain.com  # Optional
```

**Option 2: Amazon SES (Better for high volume)**
```bash
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_SES_REGION=us-east-1  # Your SES region
EMAIL_FROM=noreply@yourdomain.com  # Must be verified in SES
```

### Quick Setup Steps

**For Resend Email:**
1. Sign up at [Resend.com](https://resend.com)
2. Get API key from dashboard
3. Add to `.env.local`

**For Amazon SES:**
1. Configure SES in AWS Console (verify domain/email)
2. Create IAM credentials with SES send permissions
3. Add credentials to `.env.local`

**For Cloudflare R2:**
1. Enable R2 in Cloudflare Dashboard
2. Create bucket: `wrangler r2 bucket create bamboobot-certificates`
3. Generate API tokens with Object Read & Write permissions
4. Add credentials to `.env.local`

**For Amazon S3:**
1. Create S3 bucket in AWS Console
2. Create IAM user with S3 permissions
3. Optionally set up CloudFront distribution
4. Add credentials to `.env.local`

### Provider Benefits

| Feature | Local | Cloudflare R2 | Amazon S3 | Resend | Amazon SES |
|---------|-------|---------------|-----------|---------|------------|
| Setup Complexity | ✅ None | 🟨 Medium | 🟨 Medium | ✅ Simple | 🟨 Medium |
| Bandwidth Costs | ✅ Free | ✅ Zero egress | 🟨 Standard AWS | ✅ 100/day free | 🟨 Pay per email |
| File Size Limits | 🟥 4MB API limit | ✅ No limits | ✅ No limits | ✅ 40MB | ✅ 10MB |
| Global CDN | ❌ No | ✅ Built-in | 🟨 Optional | N/A | N/A |
| Auto Cleanup | ❌ Manual | ✅ Automatic | ✅ Automatic | N/A | N/A |
| Production Ready | 🟨 Small scale | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Enterprise |

**Note:** The app automatically uses SES if AWS credentials are configured, otherwise falls back to Resend. For storage, you must explicitly set `STORAGE_PROVIDER` to use cloud options.

## Development Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm start           # Start production server

# Docker
docker-compose up -d                    # Production mode
docker-compose -f docker-compose.dev.yml up -d  # Development with hot reload

# Testing & Linting
npm test            # Run tests
npm run lint        # Run ESLint
npm run cleanup     # Clean temporary files
```

## Project Structure

### Clean Architecture
```
app/
  └── page.tsx                 # Main orchestration component
  └── api/
      └── send-bulk-email/     # App Router API for bulk email queue management
          └── route.ts
components/
  ├── CertificatePreview.tsx   # Certificate display with drag positioning
  ├── panels/
  │   ├── DataPanel.tsx        # Data input interface  
  │   ├── FormattingPanel.tsx  # Text formatting controls
  │   └── EmailConfigPanel.tsx # Email configuration
  └── modals/
      ├── PdfGenerationModal.tsx     # PDF generation display
      ├── IndividualPdfsModal.tsx    # Individual PDF management
      ├── BulkEmailModal.tsx         # Bulk email progress with preview
      ├── EmailPreviewModal.tsx      # Email content preview
      └── ConfirmationModals.tsx     # Reset confirmations
hooks/              # Feature-specific state management
  ├── useEmailConfig.ts      # Email configuration and individual sending
  ├── useTableData.ts        # Data import and validation
  ├── usePositioning.ts      # Text field positioning
  ├── useDragAndDrop.ts      # Drag-and-drop interactions
  ├── useFileUpload.ts       # Image upload handling
  └── usePdfGeneration.ts    # PDF generation logic
lib/
  ├── email/                 # Email system architecture
  │   ├── providers/         # Email provider implementations
  │   │   ├── resend.ts      # Resend API integration
  │   │   └── ses.ts         # Amazon SES with attachment support
  │   ├── email-queue.ts     # Queue management with exponential backoff
  │   ├── email-persistence.ts # localStorage status persistence
  │   ├── provider-factory.ts  # Auto-detect email provider
  │   └── types.ts           # Email system type definitions
  ├── email-templates.ts     # Shared HTML email templates
  ├── r2-client.ts          # Cloudflare R2 integration
  ├── s3-client.ts          # Amazon S3 integration
  └── storage-config.ts     # Multi-provider storage configuration
pages/api/          # Pages Router API endpoints
  ├── upload.ts             # Image upload & PDF conversion
  ├── generate.ts           # Certificate generation
  ├── send-email.ts         # Individual email delivery (multi-provider)
  ├── zip-pdfs.ts           # ZIP archive creation
  ├── force-download.ts     # Secure file downloads
  ├── cleanup-storage.ts    # Cloud storage cleanup
  └── mark-emailed.ts       # R2/S3 retention extension
types/
  └── certificate.ts        # Centralized TypeScript interfaces
utils/
  └── styles.ts             # Color constants and theme management
public/             # Static assets & local file storage
scripts/            # Cloud storage testing and maintenance
  ├── test-r2-connection.mjs
  ├── test-s3-connection.mjs
  ├── cleanup-r2.mjs
  └── cleanup-s3.mjs
```

### Architecture Benefits
- **Modular design** with specialized components for each feature
- **Multi-provider architecture** for both storage and email with automatic failover
- **Advanced email system** with queue management, retry logic, and persistence
- **Centralized type system** for consistency across the application  
- **Theme management** with centralized color constants
- **Production-ready** with proper error handling and monitoring

### Key Architectural Patterns
- **Provider Factory Pattern** - Auto-detects email and storage providers based on environment
- **Queue System** - Email queue with exponential backoff, pause/resume, and persistence
- **Hook-Based State** - Feature-specific logic encapsulated in custom hooks
- **Component Composition** - Modular UI components with clear responsibilities
- **Hybrid API Architecture** - App Router for new features, Pages Router for legacy endpoints

### Development Guidelines
- **Types**: All interfaces centralized in `types/certificate.ts`
- **Email**: Use provider factory, never hardcode specific providers
- **Storage**: Use storage-config for unified cloud/local file operations
- **Styling**: Use `COLORS` and `GRADIENTS` from `utils/styles.ts` instead of hardcoded values
- **Components**: Extract complex UI into focused components with clear props
- **State**: Main page orchestrates, components handle their own concerns
- **Error Handling**: Always include provider context in error messages

## Testing

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm test -- __tests__/path/to/test.tsx  # Specific test
```

## Docker Deployment

### Production
```bash
docker-compose up -d      # Start production server
docker-compose logs -f    # View logs
docker-compose down       # Stop server
```

### Development with Hot Reload
```bash
docker-compose -f docker-compose.dev.yml up -d
# Access at http://localhost:3001 with instant code changes
```

## Email Features

- **Automatic Detection** - Email tab appears when email column found in data
- **Multi-Provider Support** - Works with both Resend and Amazon SES
- **Custom Configuration** - Set sender name, subject, and message
- **Delivery Options**:
  - **Download Link** - Sends a secure link (90-day expiration)
  - **PDF Attachment** - Attaches certificate directly to email
- **Advanced Features**:
  - **Email Preview** - Preview exact email content before sending
  - **Bulk Sending** - Send to all recipients with progress tracking and pause/resume
  - **Smart Retry Logic** - Exponential backoff for failed deliveries
  - **Status Persistence** - Email progress survives page refreshes
- **Rate Limit Handling** - Respects provider limits (Resend: 100/hour, SES: configurable)

## Cleanup

### Automated
```bash
npm run cleanup  # Cleans both local and Docker temporary files
```

### Manual
```bash
# Local development
rm -rf public/temp_images/* public/generated/*

# Docker production  
rm -rf ./data/temp_images/* ./data/generated/*
```

### Cloud Storage Lifecycle Management
When using cloud storage (R2 or S3), files automatically expire based on type:
- **Templates**: Permanent
- **Individual certificates**: 90 days (extended if emailed)
- **Bulk PDFs**: 7 days
- **Previews**: 24 hours

## Technology Stack

- **Framework**: Next.js 14 with TypeScript
- **Architecture**: Component-based with custom hooks and centralized state
- **UI**: Tailwind CSS + shadcn/ui components + centralized color constants
- **PDF**: pdf-lib for generation & manipulation
- **Storage**: Multi-provider (Local, Cloudflare R2, Amazon S3) with automatic lifecycle management
- **Email**: Multi-provider (Resend, Amazon SES) with advanced retry logic and persistence
- **Testing**: Jest + React Testing Library
- **Deployment**: Docker with multi-stage builds

## About Bamboobot

Bamboobot inherits its name and icon from an early Tinkertanker PDF stamping project. Bamboo symbolizes growth, resilience, and continuous learning - qualities that certificates aim to recognize in learners and professionals.

## Font Licenses

All fonts (Montserrat, Poppins, Work Sans, Roboto, Source Sans Pro, Nunito) are from Google Fonts, licensed under SIL Open Font License 1.1. Selected for excellent character spacing and professional typography.

