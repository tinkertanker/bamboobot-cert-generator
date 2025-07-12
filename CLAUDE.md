# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bamboobot is a Next.js certificate generator that allows users to upload image templates, add draggable text fields, and generate bulk certificates from tabular data.

## Development Commands

```bash
# Development
npm run dev          # Start development server on http://localhost:3000
npm run build        # Build for production
npm start           # Start production server

# Docker
docker-compose up -d    # Start with Docker Compose
docker-compose down     # Stop containers
docker-compose logs -f  # View logs

# Testing
npm test            # Run all tests with Jest
npm run test:watch  # Run tests in watch mode
npm test -- __tests__/path/to/specific.test.ts  # Run single test file

# Linting
npm run lint        # Run ESLint with Next.js configuration

# Cleanup
npm run cleanup     # Clean all temporary files
npm run cleanup:old # Delete old generated files (7+ days PDFs, 30+ days temp images)
npm run cleanup:old:dry # Preview what would be deleted without actually deleting
```

## Architecture

### Component Structure
- `pages/index.tsx` - Main orchestration layer managing state and coordinating components
- `components/CertificatePreview.tsx` - Certificate display with drag-and-drop text positioning
- `components/VirtualizedTable.tsx` - Performance-optimized table for large datasets (400+ rows)
- `components/panels/` - Data input, formatting controls, email configuration
- `components/modals/` - PDF generation, email management, confirmation dialogs
- `hooks/` - Feature-specific custom hooks for state management
- `types/certificate.ts` - Centralized TypeScript interfaces
- `utils/styles.ts` - Centralized color constants and theme management

### Key Technical Details
- **Package Manager**: npm (migrated from pnpm)
- **Next.js Config**: Uses `next.config.js` (CommonJS format)
- **Coordinate System**: PDF uses bottom-left origin (0,0), UI uses top-left - conversion in API
- **File Storage**: 
  - Development: `public/` directory
  - Production: Docker volumes + cloud storage (R2/S3)
- **Email**: Multi-provider (Resend/SES) with auto-detection
- **Cloud Storage**: Multi-provider (Cloudflare R2/Amazon S3) with lifecycle management
- **Table Virtualization**: Uses react-window for datasets > 100 rows

## Code Style Guidelines

- **Imports**: Use `@/` alias for root imports
- **Components**: React functional components with TypeScript interfaces in `types/certificate.ts`
- **Styling**: Tailwind CSS with centralized `COLORS` constants from `utils/styles.ts`
- **State**: Custom hooks for feature-specific logic
- **Types**: All interfaces centralized in `types/certificate.ts`
- **Error Handling**: Try-catch blocks with console.error logging

## Current Status

### Completed Features
- Image upload (PNG/JPEG) with PDF conversion
- Precision drag-and-drop text positioning with visual feedback
- Advanced text formatting (7 fonts, colors, alignment)
- Bulk data input (TSV/CSV with header detection)
- Entry navigation (Previous/Next/First/Last)
- PDF generation with coordinate conversion
- Email delivery with multi-provider support (Resend/SES)
- Bulk email sending with progress tracking and retry logic
- Cloud storage support (Cloudflare R2/Amazon S3)
- Cloud storage lifecycle management with retention policies
- Docker containerization (production + development)
- Development mode with preset data and configuration
- **Table virtualization for large datasets (400+ rows)** - Automatic switching to react-window
- **Automated cleanup scripts** - Remove old generated files with configurable retention

### Performance Improvements & Remaining Limitations
- ✅ **RESOLVED**: Table virtualization implemented - only visible rows render (using react-window)
- ✅ **RESOLVED**: Search & filter functionality implemented with natural language parsing
- ✅ **RESOLVED**: Progressive PDF generation prevents timeout for large batches
- ⚠️ Email rate limits (Resend: 100/hour)
- ⚠️ Memory usage spikes with large arrays during PDF generation

## Priority Tasks

### High Priority (Performance Critical)
1. ~~**Table Virtualization**~~ ✅ COMPLETED - Implemented with react-window
2. ~~**Search & Filter**~~ ✅ COMPLETED - Natural language search with column:value syntax
3. ~~**Progressive PDF Generation**~~ ✅ COMPLETED - Batch processing with pause/resume

### Medium Priority (UX Improvements)
1. **Format Templates** - Save/load formatting presets
2. **Data Validation** - Highlight empty cells, validate emails
3. **Better Error Messages** - Actionable error descriptions

### Low Priority (Nice to Have)
1. **Undo/Redo System** - Track position/formatting changes
2. **Advanced Keyboard Shortcuts** - Ctrl+P for PDF generation, Ctrl+Shift+P for individual generation, Ctrl-1, 2, 3 for each of the sidebar tabs
3. **Loading States** - Skeleton loaders and progress indicators

## Quick Wins (< 1 day each)
- Loading states and skeleton loaders
- Better error messages with "Try again" buttons
- Data validation warnings for empty cells
- Entry jump navigation (go to specific row)
- Performance optimizations (React.memo, debouncing)

## Technical Considerations

### Scaling Requirements
- **Table Performance**: < 200ms render for 400 rows
- **Memory Usage**: < 200MB for 1000 rows
- **PDF Generation**: < 30s per 100 certificates

### Email Implementation
- Multi-provider factory pattern (Resend/SES)
- Rate limit awareness per provider
- Queue system with exponential backoff
- Status persistence across sessions

### Storage Strategy
- Local storage for development
- Cloud storage (R2/S3) for production
- Automated lifecycle management
- CDN integration for performance

## Recent Updates (July 2025)

- **Table Virtualization**: Implemented react-window for tables with >100 rows
  - Automatic switching based on dataset size
  - Maintains all existing functionality (selection, highlighting, scrolling)
  - Significantly improves performance for 400+ row datasets
- **Search & Filter**: Natural language search with smart parsing
  - Column-specific search with `column:value` syntax
  - Quick filter chips for common queries
  - Real-time search result counting
- **Progressive PDF Generation**: Batch processing for large datasets
  - Automatically used for datasets > 100 entries
  - Real-time progress tracking with time estimates
  - Pause/Resume/Cancel functionality
  - Prevents timeout issues for large batches
- **Package Manager**: Migrated from pnpm to npm
  - All scripts and CI/CD updated
  - Docker configurations updated
- **Cleanup Scripts**: Added automated cleanup for old files
  - Configurable retention periods (7 days for PDFs, 30 days for temp images)
  - Dry-run mode for safety
- **Config Files**: Consolidated to use `next.config.js` only

## Common Development Tasks

When implementing new features:
1. Check priority tasks above for requirements
2. Follow existing component patterns (hooks + TypeScript)
3. Add tests for new functionality
4. Update `types/certificate.ts` for new interfaces
5. Consider performance implications for large datasets

## Testing

Tests organized by type:
- `__tests__/components/` - UI component tests
- `__tests__/pages/api/` - API endpoint tests
- `__tests__/lib/` - Utility function tests

Run specific tests:
```bash
npm test -- __tests__/components/Button.test.tsx
```

## Cleanup

### Automated Cleanup Scripts
```bash
npm run cleanup:old     # Delete old files (7+ days PDFs, 30+ days temp images)
npm run cleanup:old:dry # Preview what would be deleted without actually deleting
```

### Manual Cleanup
```bash
# Local Development
rm -rf public/temp_images/* public/generated/*

# Docker Production
rm -rf ./data/temp_images/* ./data/generated/*
docker-compose down && docker system prune -a
```

### Cloud Storage
Files automatically expire based on retention policies:
- Templates: Permanent
- Individual certificates: 90 days (extended if emailed)
- Bulk PDFs: 7 days
- Previews: 24 hours