# Bamboobot Certificate Generator

Generate certificates from image templates with drag-and-drop text positioning and bulk data processing.

## Features

- **Image Template Upload** - JPG/PNG with automatic PDF conversion
- **Precision Text Positioning** - Drag-and-drop with visual feedback and keyboard nudging
- **Advanced Text Formatting** - 7 fonts, bold/italic, color picker, alignment controls
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
pnpm install
pnpm run dev
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

Optional: Configure cloud storage and email in `.env.local`:

### Email
```bash
# Resend (recommended)
RESEND_API_KEY=re_xxxxx_xxxxx

# OR Amazon SES
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_SES_REGION=us-east-1
```

### Cloud Storage (optional)
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


## Development Commands

```bash
# Development
pnpm run dev          # Start dev server
pnpm run build        # Build for production
pnpm start           # Start production server

# Docker
docker-compose up -d                    # Production mode
docker-compose -f docker-compose.dev.yml up -d  # Development with hot reload

# Testing & Linting
pnpm test            # Run tests
pnpm run lint        # Run ESLint
pnpm run cleanup     # Clean temporary files
```

## Project Structure

```
pages/
  ├── index.tsx               # Main application page
  ├── _app.tsx                # App wrapper with fonts
  └── api/                    # API endpoints
components/
  ├── CertificatePreview.tsx  # Certificate display with drag positioning
  ├── panels/                 # Data, formatting, email config panels
  └── modals/                 # PDF generation, email, confirmation modals
hooks/                        # Feature-specific state management
lib/
  ├── email/                  # Email providers and queue system
  ├── r2-client.ts           # Cloudflare R2 integration
  ├── s3-client.ts           # Amazon S3 integration
  └── storage-config.ts      # Multi-provider storage
types/certificate.ts         # TypeScript interfaces
```

### Development Guidelines
- Types centralized in `types/certificate.ts`
- Use provider factory for email/storage, never hardcode
- Use `COLORS` constants from `utils/styles.ts`
- Extract complex UI into focused components

## Testing

```bash
pnpm test                    # Run all tests
pnpm run test:watch          # Watch mode
pnpm test -- __tests__/path/to/test.tsx  # Specific test
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

- Email tab appears when email column detected in data
- Multi-provider support (Resend/Amazon SES)
- Bulk sending with progress tracking and retry logic
- Email preview before sending

## Cleanup

```bash
pnpm run cleanup  # Clean temporary files
rm -rf public/temp_images/* public/generated/*  # Manual cleanup
```

### Cloud Storage Lifecycle
When using cloud storage (R2 or S3), files automatically expire:
- **Templates**: Permanent
- **Individual certificates**: 90 days (extended if emailed)
- **Bulk PDFs**: 7 days
- **Previews**: 24 hours

## Technology Stack

- **Framework**: Next.js 15 with TypeScript
- **Package Manager**: pnpm
- **UI**: Tailwind CSS + shadcn/ui components
- **PDF**: pdf-lib
- **Storage**: Local, Cloudflare R2, or Amazon S3
- **Email**: Resend or Amazon SES
- **Testing**: Jest + React Testing Library
- **Deployment**: Docker

## Font Licenses

All fonts (Montserrat, Poppins, Work Sans, Roboto, Source Sans Pro, Nunito) are from Google Fonts, licensed under SIL Open Font License 1.1.

## About Bamboobot

Bamboobot inherits its name and icon from an early Tinkertanker PDF stamping project. Bamboo symbolizes growth, resilience, and continuous learning - qualities that certificates aim to recognize in learners and professionals.


