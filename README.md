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
- **Live Preview** - Real-time preview matching final PDF output
- **Cloud Storage** - Optional Cloudflare R2 integration with global CDN
- **Docker Support** - Production-ready containerization

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
6. **Generate** - Create single PDF or individual PDFs
7. **Download** - Get merged PDF, individual files, or ZIP archive

## Configuration

### Storage Options

**Local Storage (Default)**
- Works out of the box, no configuration needed
- Files stored in `public/` directory

**Cloudflare R2 (Recommended for Production)**
- Global CDN delivery, zero bandwidth costs
- Copy `.env.example` to `.env.local` and configure R2 credentials

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

```
app/              # Next.js app router components
components/       # Reusable UI components  
lib/              # Utilities and storage config
pages/api/        # API endpoints
  ├── upload.ts      # Image upload & PDF conversion
  ├── generate.ts    # Certificate generation
  ├── zip-pdfs.ts    # ZIP archive creation
  └── force-download.ts  # File download handling
public/           # Static assets & local storage
scripts/          # Utility scripts
```

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
- **UI**: Tailwind CSS + shadcn/ui components
- **PDF**: pdf-lib for generation & manipulation
- **Storage**: Local filesystem + optional Cloudflare R2
- **Testing**: Jest + React Testing Library
- **Deployment**: Docker with multi-stage builds

## About Bamboobot

Bamboobot inherits its name and icon from an early Tinkertanker PDF stamping project. Bamboo symbolizes growth, resilience, and continuous learning - qualities that certificates aim to recognize in learners and professionals.

## Font Licenses

All fonts (Montserrat, Poppins, Work Sans, Roboto, Source Sans Pro, Nunito) are from Google Fonts, licensed under SIL Open Font License 1.1. Selected for excellent character spacing and professional typography.

