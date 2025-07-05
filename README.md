# Bamboobot Certificate Generator

A professional Next.js application for generating certificates from uploaded image templates. Bamboobot allows users to upload an image, convert it to a PDF template, add text fields with drag-and-drop positioning, and generate certificates in bulk from tabular data.

## Features

- **Image Template Upload** - Support for JPG/PNG images with automatic PDF conversion
- **Drag & Drop File Upload** - Intuitive file upload with visual feedback
- **Precision Text Positioning** - Pointer-based drag system with visual feedback and touch support
- **Advanced Text Formatting** - Complete font controls with live preview:
  - Font size adjustment (8-72px) with slider and number input
  - **9 Professional Fonts**: Helvetica, Times, Courier, Montserrat, Poppins, Work Sans, Roboto, Source Sans Pro, Nunito
  - **Kerning-Optimized Selection**: All custom fonts chosen for excellent character spacing and professional typography
  - **Smart Font Capabilities**: Bold/italic buttons automatically disable for fonts that don't support them
  - Text color picker with hex display
  - Text alignment (left, center, right) with visual bracket indicators
  - Apply formatting to all fields with one click
- **Smart Entry Navigation** - Previous/Next/First/Last navigation with entry counter
- **Bulk Data Import** - TSV/CSV support with header row toggle
- **Batch Certificate Generation** - Generate multiple certificates from tabular data
- **Individual PDF Generation** - Create separate PDFs with custom filenames
- **ZIP Download** - Download all individual PDFs in a single ZIP file
- **Live Preview** - Real-time preview matching final PDF output
- **Professional UI** - Dark green theme with coral accents and clean spacing
- **Cloudflare R2 Integration** - Global CDN delivery with zero bandwidth costs (optional)
- **Docker Support** - Production-ready containerization with development hot reload

## Quick Start

### Option 1: Local Development (Simplest)

```bash
# Clone the repository
git clone <repository-url>
cd bamboobot-cert-generator

# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:3000
```

The app will work immediately with local file storage (no additional configuration needed).

### Option 2: Docker (Recommended for Production)

```bash
# Production mode
docker-compose up -d
# Access at http://localhost:3000

# Development mode with hot reload
docker-compose -f docker-compose.dev.yml up -d
# Access at http://localhost:3001
```

## Storage Configuration

Bamboobot supports two storage modes:

### 1. Local Storage (Default)
- **No configuration required** - works out of the box
- Files stored in `public/` directory
- Perfect for development and small deployments
- Automatic fallback if cloud storage is not configured

### 2. Cloudflare R2 (Recommended for Production)
- **Global CDN delivery** with edge caching
- **Zero bandwidth costs** (no egress fees)
- **No file size limits** (eliminates 4MB API warnings)
- **Automatic file expiration** (configurable)

To enable R2:

1. **Copy environment template:**
   ```bash
   cp .env.example .env.local
   ```

2. **Set up Cloudflare R2** (see detailed setup below)

3. **Fill in your R2 credentials** in `.env.local`

4. **Restart your application**

The app automatically detects R2 configuration and switches modes seamlessly.

## How to Use

1. **Upload Template**: Drag & drop or select a JPG/PNG image
2. **Add Data**: Paste TSV/CSV data in the Data section (toggle "Treat first row as header" if needed)
3. **Position Text**: Drag text fields to desired positions on the template
4. **Format Text**: Click any text field to open formatting controls
   - Adjust font size with slider (8-72px) or number input
   - Select from 9 professional fonts (Helvetica, Times, Courier, Montserrat, Poppins, Work Sans, Roboto, Source Sans Pro, Nunito)
   - Toggle bold and italic styling (available fonts only)
   - Choose text color with color picker
   - Set text alignment (left, center, right) with visual indicators
   - Apply current formatting to all fields at once
5. **Navigate Entries**: Use Previous/Next buttons to preview different certificate entries
6. **Generate PDFs**: 
   - Click "Generate PDF" to create a single merged PDF with all certificates
   - Or click "Generate Individual" to create separate PDFs for each data row
7. **Download Options**:
   - Download the merged PDF with all certificates
   - Download individual PDFs one by one with custom filenames
   - Download all individual PDFs as a ZIP file for easy distribution

## Visual Features

- **Alignment Indicators**: Visual bracket-style markers show text alignment:
  - Left: L-shaped brackets at left corners
  - Center: Clean horizontal lines at center
  - Right: Backwards L-shaped brackets at right corners
- **Smart Drag Behavior**: Text fields use correct anchor points based on alignment
- **Live Preview**: All formatting changes appear instantly in the preview
- **Clean Interface**: Professional dark green theme with intuitive spacing

## Cloudflare R2 Setup (Optional)

### Prerequisites

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### Setup Steps

1. **Enable R2 in Cloudflare Dashboard**
   - Go to https://dash.cloudflare.com/
   - Navigate to R2 Object Storage
   - Enable R2 (requires payment method, includes generous free tier)

2. **Create R2 Bucket**
   ```bash
   wrangler r2 bucket create bamboobot-certificates
   ```

3. **Generate API Tokens**
   - Cloudflare Dashboard → R2 → Manage R2 API Tokens
   - Create API Token with Object Read & Write permissions
   - Specify bucket: bamboobot-certificates

4. **Configure Environment Variables**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your R2 credentials
   ```

5. **Restart Application**
   The app will automatically detect R2 configuration and use cloud storage.

### R2 Benefits
- ✅ **No bandwidth costs** - Zero egress fees
- ✅ **Global CDN** - Automatic edge caching via Cloudflare
- ✅ **No API limits** - Eliminates 4MB response warnings
- ✅ **Scalable** - Handles unlimited certificates
- ✅ **Fast downloads** - Direct CDN delivery
- ✅ **Automatic cleanup** - Configurable file expiration

## Development Commands

```bash
# Development
npm run dev          # Start development server on http://localhost:3000

# Production
npm run build        # Build for production
npm start           # Start production server

# Docker
docker-compose up -d    # Start with Docker Compose
docker-compose down     # Stop containers
docker-compose logs -f  # View logs

# Testing
npm test            # Run all tests with Jest
npm run test:watch  # Run tests in watch mode

# Linting & Cleanup
npm run lint        # Run ESLint with Next.js configuration
npm run cleanup     # Clean temporary files (local and Docker)
```

## Project Structure

- `app/` - Next.js app router components
- `components/` - Reusable UI components
- `lib/` - Utility functions and storage configuration
- `pages/api/` - API endpoints
  - `upload.ts` - Handles image upload and PDF conversion
  - `generate.ts` - Processes certificate generation with positioned text
  - `zip-pdfs.ts` - Creates ZIP archives of individual PDFs
  - `force-download.ts` - Forces file downloads (handles R2 and local files)
  - `files/` - Dynamic file serving endpoints for production
- `public/` - Static assets and local file storage
- `scripts/` - Utility scripts for cleanup and maintenance

## Testing

This project uses Jest and React Testing Library for unit and component testing.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- __tests__/components/Button.test.tsx
```

The test suite includes:
- API endpoint tests
- Component tests
- Utility function tests
- Page integration tests

## Docker Deployment

### Production Deployment
```bash
# Build and run production version
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f cert-generator

# Stop the application
docker-compose down
```

### Development with Hot Reload
```bash
# Start development server with hot reload
docker-compose -f docker-compose.dev.yml up -d

# View development logs
docker-compose -f docker-compose.dev.yml logs -f cert-generator-dev

# Stop development server
docker-compose -f docker-compose.dev.yml down
```

### Docker Features
- **Development Mode**: Hot reload, instant code changes, port 3001
- **Production Mode**: Optimized build, smaller image, port 3000
- Multi-stage build for optimized image size
- Non-root user for security
- Volume mounts for persistent file storage
- Health checks and auto-restart
- Alpine Linux base for minimal footprint

### Quick Development Workflow
1. Start development server: `docker-compose -f docker-compose.dev.yml up -d`
2. Edit code in your IDE - changes appear instantly at http://localhost:3001
3. Test production build: `docker-compose up -d` (runs on http://localhost:3000)
4. No container rebuilds needed for development!

## Technology Stack

- [Next.js 14](https://nextjs.org/) - React framework with App Router
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [pdf-lib](https://pdf-lib.js.org/) - PDF manipulation and generation
- [archiver](https://github.com/archiverjs/node-archiver) - ZIP archive creation for bulk downloads
- [formidable](https://github.com/node-formidable/formidable) - File upload handling
- [react-table](https://react-table-v7.tanstack.com/) - Data table management
- [shadcn/ui](https://ui.shadcn.com/) - Modern UI components
- [Cloudflare R2](https://developers.cloudflare.com/r2/) - Cloud object storage with CDN
- [AWS SDK](https://aws.amazon.com/sdk-for-javascript/) - S3-compatible API for R2
- [Docker](https://www.docker.com/) - Containerization for production
- [Jest](https://jestjs.io/) - Testing framework

## Development Troubleshooting

### Webpack Module Not Found Error

If you encounter errors like `Error: Cannot find module './682.js'` during development:

**Symptoms:**
- Error appears after making code changes
- References missing webpack chunk files (e.g., `./682.js`)
- Shows webpack-runtime.js in the error stack

**Solution:**
1. Stop the dev server (`Ctrl+C`)
2. Clear the Next.js cache: `rm -rf .next`
3. Restart the dev server: `npm run dev`

**Why this happens:**
- Next.js webpack hot module replacement (HMR) can sometimes lose track of chunk files
- Often occurs after significant code changes or when switching between branches
- The `.next` directory contains cached build artifacts that may become stale

**Prevention tips:**
- Consider adding `.next` to your `.gitignore` (should already be there)
- If the issue persists, try: `npm run build && npm run dev`
- Update Next.js to the latest version when possible

## Cleanup

### Automated Cleanup Script

Use the built-in cleanup script to remove temporary files from both local development and Docker environments:

```bash
npm run cleanup
```

This script automatically cleans:
- **Local development**: `public/temp_images/` and `public/generated/`
- **Docker volumes**: `./data/temp_images/` and `./data/generated/`

The script provides a detailed summary showing how many files were removed from each location.

### Manual Cleanup

**Local Development:**
```bash
# Clean all temporary uploaded images
rm -rf public/temp_images/*

# Clean all generated PDFs  
rm -rf public/generated/*
```

**Docker Production:**
```bash
# Clean mounted volumes
rm -rf ./data/temp_images/*
rm -rf ./data/generated/*

# Full Docker cleanup
docker-compose down
docker system prune -a  # Remove unused images
docker volume prune     # Remove unused volumes
```

### Cloudflare R2 Lifecycle Management

When using R2 storage, Bamboobot includes intelligent lifecycle management to automatically clean up expired files while preserving important certificates:

**Retention Policies:**
- **Preview/Temporary files** (24 hours) - Quick downloads after generation
- **Individual certificates** (90 days) - Extended retention for email links
- **Bulk/Merged PDFs** (7 days) - Downloaded immediately by generator
- **Template images** (permanent) - Never auto-deleted

**Key Features:**
- **Email-aware retention** - Certificates marked as emailed are kept for 90+ days
- **Metadata tracking** - Each file stores type, creation date, and retention policy
- **Manual cleanup API** - Run cleanup on-demand or via cron job
- **Flexible overrides** - Extend retention for specific use cases

**Setup Cleanup (Optional):**

1. **Add cleanup authentication** to `.env.local`:
   ```bash
   CLEANUP_SECRET_KEY=your-secret-cleanup-key-here
   ```

2. **Test cleanup locally**:
   ```bash
   npm run test:r2-cleanup  # Dry run to preview what would be deleted
   ```

3. **Setup automated cleanup** (cron job example):
   ```bash
   # Run cleanup daily at 2 AM
   0 2 * * * /path/to/bamboobot/scripts/r2-cleanup.sh
   ```

4. **Manual cleanup via API**:
   ```bash
   curl -X POST https://your-domain.com/api/cleanup-r2 \
     -H "X-Cleanup-Key: your-secret-cleanup-key-here"
   ```

**Email Integration:**
When implementing email functionality, use the `markAsEmailed` function to automatically extend retention for certificates sent via email:
```javascript
import { markAsEmailed } from '@/lib/r2-client';
await markAsEmailed('generated/individual_123/cert.pdf');
```

## About the Name

Bamboobot inherits its name and icon from an early Tinkertanker project focused on PDF stamping. The bamboo metaphor resonates deeply with the essence of certificate generation and recognition:

**Bamboo symbolizes:**
- **Growth and resilience** - bends but doesn't break, much like learners who persist through challenges
- **Integrity and uprightness** - representing the honest achievements that certificates recognize
- **Flexibility and strength** - adapting to different learning paths while maintaining core values
- **Continuous learning and improvement** - bamboo's rapid growth mirrors lifelong development

These qualities align perfectly with what certificates aim to recognize in learners and professionals. Whether you're designing certificates for educational achievements, professional development, or skill recognition, Bamboobot embodies the spirit of:
- **Lifelong learning** - celebrating continuous growth
- **Personal development** - acknowledging individual progress
- **Humble strength** - recognizing quiet determination and perseverance

Just as bamboo grows steadily and stands tall, Bamboobot helps you create certificates that honor the journey of learning and achievement.

## Font Licenses

This project includes fonts from Google Fonts, all licensed under SIL Open Font License 1.1:

- **Montserrat** by Julieta Ulanovsky - Modern geometric sans-serif with excellent readability
- **Poppins** by Indian Type Foundry - Geometric typeface with friendly personality
- **Work Sans** by Wei Huang - Clean humanist design with character
- **Roboto** by Christian Robertson - Google's flagship font with superior kerning
- **Source Sans Pro** by Paul D. Hunt (Adobe) - Professional typography masterpiece
- **Nunito** by Vernon Adams - Friendly rounded design with excellent spacing

All fonts were specifically chosen for their excellent character spacing and kerning properties, ensuring professional-quality certificate output. All fonts are licensed under SIL Open Font License 1.1 (https://scripts.sil.org/OFL).