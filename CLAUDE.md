# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js certificate generator application that allows users to upload image templates, convert them to PDFs, add draggable text fields, and generate bulk certificates from tabular data.

## Development Commands

```bash
# Development
npm run dev          # Start development server on http://localhost:3000

# Production
npm run build        # Build for production
npm start           # Start production server

# Testing
npm test            # Run all tests with Jest
npm run test:watch  # Run tests in watch mode
jest __tests__/path/to/specific.test.ts  # Run single test file

# Linting
npm run lint        # Run ESLint with Next.js configuration
```

## Architecture

### Frontend Flow
1. **Main Page** (`app/page.tsx`): Single-page application with certificate designer
2. **Template Upload**: Image files are uploaded via `/api/upload`, converted to PDF, and stored in `public/temp_images/`
3. **Text Positioning**: Drag-and-drop interface allows users to position text fields on the template
4. **Data Input**: Table interface supports TSV/CSV paste with header row toggle
5. **PDF Generation**: `/api/generate` creates individual certificates and merges them into a single PDF

### API Endpoints
- `/api/upload`: Handles image upload and PDF conversion using pdf-lib
- `/api/generate`: Processes certificate generation with positioned text fields

### Key Dependencies
- **pdf-lib**: PDF manipulation and generation
- **formidable**: File upload handling
- **react-table**: Data table implementation
- **shadcn/ui**: UI components (Button, Textarea, Spinner)

## Testing Approach

Tests are organized by type:
- `__tests__/components/`: UI component tests
- `__tests__/pages/`: Page-level integration tests
- `__tests__/pages/api/`: API endpoint tests
- `__tests__/lib/`: Utility function tests

Run a specific test file:
```bash
npm test -- __tests__/components/Button.test.tsx
```

## Code Style Guidelines

- **Imports**: Use `@/` alias for root imports (`@/components`, `@/lib`, `@/pages`)
- **Components**: React functional components with TypeScript interfaces
- **Styling**: Tailwind CSS classes, shadcn/ui components with `cn()` utility
- **State**: React hooks (useState, useMemo, useCallback) with proper TypeScript typing
- **Naming**: camelCase for variables/functions, PascalCase for components/interfaces
- **Error Handling**: Try-catch blocks for async operations, console.error for logging
- **Types**: Explicit TypeScript interfaces for props and data structures

## Important Considerations

1. **File Storage**: Currently uses `public/` directory for file storage (not scalable for production)
2. **No Authentication**: The app is currently open access
3. **Text Formatting**: Supports Helvetica, Times, and Courier fonts with bold/italic options
4. **Coordinate System**: PDF uses bottom-left origin (0,0), while UI uses top-left origin - conversion happens in the API

## Current Features Status

### ✅ Completed
- Image upload (PNG/JPEG) with PDF conversion
- Visual drag-and-drop text placement
- Bulk data input with table interface
- PDF generation and merging
- Font formatting (Helvetica, Times, Courier with bold/italic)
- Download functionality

### 🚧 Planned Features (Priority Order)

**Phase 1 - Core Missing Features**
- Docker configuration (Dockerfile, docker-compose.yml)
- Email functionality (SMTP, bulk sending, templates)
- Individual PDF generation with ZIP download option

**Phase 2 - Enhanced Functionality**
- PDF template support (currently only images)
- Enhanced text formatting (font size, alignment, color)
- Template management system (save/load/share)

**Phase 3 - Platform Features**
- Authentication & user management (NextAuth.js)
- UI/UX improvements (mobile responsive, undo/redo)
- API development for external integrations

**Phase 4 - Advanced Features**
- QR code generation for verification
- Performance optimization (caching, CDN)
- Webhook notifications

### Technical Considerations for Future Development
- **Email Service**: Consider Nodemailer, Resend, or SendGrid
- **Storage**: Migrate from local filesystem to AWS S3 or similar
- **Database**: Will need PostgreSQL/MongoDB for user management and templates
- **Deployment**: Docker containers on VPS, Vercel, or cloud providers

## Common Development Tasks

When implementing new features:
1. Check the planned features section above for requirements
2. Follow the existing pattern of client-side UI with server-side PDF processing
3. Add appropriate tests for new functionality
4. Ensure TypeScript types are properly defined
5. Consider scalability implications (especially for file storage and email sending)