# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bamboobot is a Next.js certificate generator that allows users to upload image templates, add draggable text fields, and generate bulk certificates from tabular data. The system now supports full project saves that include both the template image and all certificate data.

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

## Completed Features ✅

### Core Features
- Image upload (PNG/JPEG) with PDF conversion
- Precision drag-and-drop text positioning with visual feedback
- Advanced text formatting (7 fonts, colors, alignment)
- Bulk data input (TSV/CSV with header detection)
- Entry navigation (Previous/Next/First/Last)
- PDF generation with coordinate conversion
- Email delivery with multi-provider support (Resend/SES)
- Bulk email sending with progress tracking and retry logic
- Cloud storage support (Cloudflare R2/Amazon S3)
- Docker containerization (production + development)
- Development mode with preset data and configuration
- Automated cleanup scripts for old files
- Background image replacement feature with split button
- Format Templates - Save/load formatting presets (legacy feature, now part of project system)
- Loading States - Enhanced loading states with shimmer effects
- Project System - Complete transformation from templates to projects that save both formatting and data
- Project Management - Inline rename, relative timestamps, mass delete with confirmation
- Project Autosave - Smart autosave that updates existing projects without creating duplicates

### Performance Features (All High Priority Items ✅)
1. **Table Virtualization** - React-window for datasets > 100 rows
2. **Search & Filter** - Natural language search with column:value syntax
3. **Progressive PDF Generation** - Batch processing with pause/resume/cancel

## Remaining Tasks 📋

### Medium Priority (UX Improvements)
1. **Data Validation** - Highlight empty cells, validate emails
   - Visual indicators for empty required fields
   - Email format validation
   - Duplicate detection

2. **Better Error Messages** - Actionable error descriptions
   - Replace technical errors with user-friendly messages
   - Add "Try again" buttons
   - Suggest fixes for common issues

### Progressive PDF Modal Enhancements
- **ZIP Download in Progressive Modal** - Add ZIP download button (currently only in Individual PDFs modal)
- **Email All from Progressive Modal** - Add email all button (currently requires closing and reopening in Individual PDFs modal)

### Quick Wins (< 1 day each)
- Entry jump navigation (go to specific row)
- Performance optimizations (React.memo, debouncing)
- Loading states for async operations
- Tooltip improvements

## Known Limitations ⚠️
- Email rate limits (Resend: 100/hour)
- Memory usage spikes with very large datasets (1000+ rows)

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

### Performance Improvements
- **Table Virtualization** ✅ - React-window for >100 rows with automatic switching
- **Search & Filter** ✅ - Natural language search with `column:value` syntax
- **Progressive PDF Generation** ✅ - Batch processing prevents timeouts

### Feature Updates
- **Templates → Projects Transformation** ✅ - Templates now save complete table data, not just formatting
- **Project Management** ✅ - Added inline rename, relative timestamps ("2 hours ago"), row/column count display
- **Mass Delete** ✅ - Added "Delete All" with two-step confirmation requiring "DELETE ALL" input
- **Autosave Improvements** ✅ - Fixed duplicate save issues, autosave only updates existing projects
- **Background Replacement** ✅ - Fixed Dev Mode background functionality
- **Text Field Improvements** ✅ - Fixed arrow key conflicts, multiline text display issues

### Infrastructure Updates
- Migrated from pnpm to npm
- Added automated cleanup scripts with configurable retention
- Consolidated to single `next.config.js` configuration

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
- Projects: Permanent
- Individual certificates: 90 days (extended if emailed)
- Bulk PDFs: 7 days
- Previews: 24 hours