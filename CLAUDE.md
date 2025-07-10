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
```

## Architecture

### Component Structure
- `pages/index.tsx` - Main orchestration layer managing state and coordinating components
- `components/CertificatePreview.tsx` - Certificate display with drag-and-drop text positioning
- `components/panels/` - Data input, formatting controls, email configuration
- `components/modals/` - PDF generation, email management, confirmation dialogs
- `hooks/` - Feature-specific custom hooks for state management
- `types/certificate.ts` - Centralized TypeScript interfaces
- `utils/styles.ts` - Centralized color constants and theme management

### Key Technical Details
- **Package Manager**: npm
- **Coordinate System**: PDF uses bottom-left origin (0,0), UI uses top-left - conversion in API
- **File Storage**: 
  - Development: `public/` directory
  - Production: Docker volumes + cloud storage (R2/S3)
- **Email**: Multi-provider (Resend/SES) with auto-detection
- **Cloud Storage**: Multi-provider (Cloudflare R2/Amazon S3) with lifecycle management

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

### Performance Limitations (Large Datasets 400+ rows)
- No table virtualization - all rows render causing lag
- No pagination or search/filter functionality
- PDF generation timeout risk (300s Next.js limit)
- Email rate limits (Resend: 100/hour)
- Memory usage spikes with large arrays

## Priority Tasks

### High Priority (Performance Critical)
1. **Table Virtualization** - Use react-window for large datasets
2. **Search & Filter** - Client-side filtering across columns
3. **Progressive PDF Generation** - Batch processing with progress

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

### Local Development
```bash
rm -rf public/temp_images/* public/generated/*
```

### Docker Production
```bash
rm -rf ./data/temp_images/* ./data/generated/*
docker-compose down && docker system prune -a
```

### Cloud Storage
Files automatically expire based on retention policies:
- Templates: Permanent
- Individual certificates: 90 days (extended if emailed)
- Bulk PDFs: 7 days
- Previews: 24 hours