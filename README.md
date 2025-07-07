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
- **Email Delivery** - Send certificates via email with custom messages (Resend integration)
- **Live Preview** - Real-time preview matching final PDF output
- **Cloud Storage** - Optional Cloudflare R2 integration with global CDN
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

### Storage Options

**Local Storage (Default)**
- Works out of the box, no configuration needed
- Files stored in `public/` directory

**Cloudflare R2 (Recommended for Production)**
- Global CDN delivery, zero bandwidth costs
- Copy `.env.example` to `.env.local` and configure R2 credentials

### Email Configuration (Resend)

1. **Sign up** at [Resend.com](https://resend.com) for a free account
2. **Get API Key** from your Resend dashboard
3. **Configure** `.env.local`:
   ```bash
   RESEND_API_KEY=re_123456789_XXXXXXXXXXXXXXXXXXXXXXXX
   EMAIL_FROM=certificates@yourdomain.com  # Optional custom sender
   ```
4. **Verify Domain** (optional) - For custom sender addresses
5. **Test** - The Email tab appears when an email column is detected in your data

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
  └── page.tsx           # Main orchestration component
components/
  ├── CertificatePreview.tsx    # Certificate display with drag positioning
  ├── panels/
  │   ├── DataPanel.tsx         # Data input interface  
  │   ├── FormattingPanel.tsx   # Text formatting controls
  │   └── EmailConfigPanel.tsx  # Email configuration
  └── modals/
      ├── PdfGenerationModal.tsx     # PDF generation display
      ├── IndividualPdfsModal.tsx    # Individual PDF management
      └── ConfirmationModals.tsx     # Reset confirmations
hooks/            # Feature-specific state management
lib/              # Utilities and storage config
pages/api/        # API endpoints
  ├── upload.ts         # Image upload & PDF conversion
  ├── generate.ts       # Certificate generation
  ├── send-email.ts     # Email delivery with Resend
  ├── zip-pdfs.ts       # ZIP archive creation
  └── force-download.ts # File download handling
types/
  └── certificate.ts    # Centralized TypeScript interfaces
utils/
  └── styles.ts         # Color constants and theme management
public/           # Static assets & local storage
scripts/          # Utility scripts
```

### Architecture Benefits
- **Modular design** with specialized components for each feature
- **Centralized type system** for consistency across the application
- **Theme management** with centralized color constants
- **Maintainable and scalable** component architecture

### Development Guidelines
- **Types**: All interfaces centralized in `types/certificate.ts`
- **Styling**: Use `COLORS` and `GRADIENTS` from `utils/styles.ts` instead of hardcoded values
- **Components**: Extract complex UI into focused components with clear props
- **Hooks**: Feature-specific logic lives in custom hooks
- **State**: Main page orchestrates, components handle their own concerns

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

## Cloudflare R2 Setup (Optional)

1. **Enable R2** in Cloudflare Dashboard
2. **Create bucket**: `wrangler r2 bucket create bamboobot-certificates`
3. **Generate API tokens** with Object Read & Write permissions
4. **Configure** `.env.local` with your credentials:
   ```bash
   R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=your-access-key
   R2_SECRET_ACCESS_KEY=your-secret-key
   R2_BUCKET_NAME=bamboobot-certificates
   R2_PUBLIC_URL=https://your-custom-domain.com  # Optional custom domain
   ```
5. **Restart** your application

### R2 Benefits
- ✅ Zero bandwidth costs with global CDN
- ✅ No file size limits (eliminates 4MB API warnings)  
- ✅ Automatic file expiration (24h-90d retention policies)
- ✅ Email-aware retention extension

## Email Delivery

### Features
- **Automatic Detection** - Email tab appears when email column found in data
- **Custom Sender** - Configure sender name for personalized emails
- **Custom Subject** - Set your own email subject line
- **Custom Message** - Full control over email content (plain text)
- **Delivery Options**:
  - **Download Link** - Sends a secure link (90-day expiration)
  - **PDF Attachment** - Attaches certificate directly to email
- **Bulk Sending** - Send to all recipients with progress tracking

### Email Column Detection
The system automatically detects email columns by:
- Column header containing "email", "e-mail", or "mail"
- Valid email format in the data rows

### Rate Limits
- **Resend Free Tier**: 100 emails/day, 3000 emails/month
- **Production**: Consider upgrading for higher limits

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

### R2 Lifecycle Management
When using R2, files automatically expire based on type:
- **Templates**: Permanent
- **Individual certificates**: 90 days (extended if emailed)
- **Bulk PDFs**: 7 days
- **Previews**: 24 hours

## Technology Stack

- **Framework**: Next.js 14 with TypeScript
- **Architecture**: Component-based with custom hooks and centralized state
- **UI**: Tailwind CSS + shadcn/ui components + centralized color constants
- **PDF**: pdf-lib for generation & manipulation
- **Storage**: Local filesystem + optional Cloudflare R2
- **Email**: Resend API integration
- **Testing**: Jest + React Testing Library
- **Deployment**: Docker with multi-stage builds

## About Bamboobot

Bamboobot inherits its name and icon from an early Tinkertanker PDF stamping project. Bamboo symbolizes growth, resilience, and continuous learning - qualities that certificates aim to recognize in learners and professionals.

## Font Licenses

All fonts (Montserrat, Poppins, Work Sans, Roboto, Source Sans Pro, Nunito) are from Google Fonts, licensed under SIL Open Font License 1.1. Selected for excellent character spacing and professional typography.

