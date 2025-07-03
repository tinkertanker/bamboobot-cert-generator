# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is Bamboobot, a Next.js certificate generator application that allows users to upload image templates, convert them to PDFs, add draggable text fields, and generate bulk certificates from tabular data.

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
- `/api/files/temp_images/[filename]`: Serves uploaded images in production
- `/api/files/generated/[filename]`: Serves generated PDFs in production

### Key Dependencies
- **pdf-lib**: PDF manipulation and generation
- **formidable**: File upload handling
- **react-table**: Data table implementation
- **shadcn/ui**: UI components (Button, Textarea, Spinner)
- **mime-types**: Content type detection for file serving
- **Docker**: Production containerization

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

1. **File Storage**: 
   - Development: Uses `public/` directory
   - Production: Docker volumes mounted to `data/` directory
   - API endpoints handle dynamic file serving in production
2. **No Authentication**: The app is currently open access
3. **Advanced Text Formatting**: 
   - **9 Professional Fonts**: Helvetica, Times, Courier, Montserrat, Poppins, Work Sans, Roboto, Source Sans Pro, Nunito
   - **Kerning-Optimized Selection**: All custom fonts chosen for excellent character spacing and professional typography
   - **Smart Font Capabilities**: Bold/italic buttons automatically disable for fonts that don't support them
   - **Complete Font Controls**: Size (8-72px), family selection, bold, italic, color picker
   - **Live Preview**: All formatting changes appear instantly in the UI
   - Click any text field to access formatting panel with live preview
   - Apply formatting to all fields with one click
4. **Coordinate System**: PDF uses bottom-left origin (0,0), while UI uses top-left origin - conversion happens in the API
5. **Drag System**: Uses pointer events for precise positioning with visual feedback and touch support
6. **Production Mode**: Next.js doesn't serve dynamic files from public/ in production, hence the file serving API

## Current Features Status

### ✅ Completed
- Image upload (PNG/JPEG) with PDF conversion
- Drag-and-drop file upload support with visual feedback
- **Precision drag-and-drop text placement** with pointer events system
  - Eliminates ghost/shadow images during dragging
  - Precise positioning with offset tracking from element center
  - Visual feedback with blue border during drag operations
  - Touch device compatibility and smooth global event handling
- Bulk data input with table interface (TSV/CSV with header toggle)
- **Advanced PDF generation and coordinate system**
  - Container-dimension-based font scaling for accurate UI-to-PDF matching
  - Proper coordinate conversion (UI top-left to PDF bottom-left origin)
  - Text centering and positioning that matches UI preview exactly
- **Complete font formatting UI controls**
  - Font size adjustment (8-72px) with slider and number input
  - Font family selection (Helvetica, Times, Courier)
  - Bold and italic toggle buttons
  - Text color picker with hex color display
  - Apply formatting to all fields button
  - Live preview of all formatting changes
  - Per-field formatting persistence
  - Click-to-deselect functionality
- **Tabbed UI with optimized layout**
  - Data and Formatting tabs for better space utilization
  - 60%/40% layout split favoring design area
  - Automatic tab switching when selecting text fields
  - Clear visual feedback for active tabs
- PDF download functionality with proper URL handling
- Automatic text field positioning for all table columns
- **Docker containerization** (Dockerfile, docker-compose.yml)
  - Production-ready multi-stage build
  - Non-root user security
  - Dynamic file serving API for production mode
  - Volume mounts for persistent storage
  - Development mode with hot reload (docker-compose.dev.yml)
- **Entry navigation system**
  - Previous/Next/First/Last navigation buttons with unicode symbols
  - Entry counter showing "X of Y"
  - Smart button states based on position
  - Preview updates with current entry data
- **Professional dark green theme**
  - Primary Dark Green (#1B4332) with gradients
  - Medium Green (#2D6A4F) for active elements
  - Complementary Coral (#E76F51) for action buttons
  - Amber (#F4A261) accents for highlights
  - Light beige background (#F5F1E8)
  - Improved contrast and accessibility
- **UI/UX enhancements**
  - Generate PDF button moved to header
  - Clean toolbar layout below preview area
  - Proper spacing with right margin on panels
  - Grey background (#ccc) for inactive tabs
  - Unicode symbols throughout (no emojis)

### 🚧 Current Development: Individual PDF Generation

**Implementation Plan:**
1. **UI Changes**:
   - Two generate buttons: "Generate PDF" (single merged) and "Generate Individual PDFs"
   - New modal for individual PDFs with file listing
   
2. **Individual PDFs Modal Design**:
   - 75% screen width (consistent with merged PDF modal)
   - Column dropdown to select naming source (defaults to first column)
   - File list with preview/email icons per file
   - Bulk actions: Download All (ZIP), Email All
   - Auto-handles duplicates with numbering (John.pdf, John-1.pdf, John-2.pdf)

3. **API Changes**:
   - `/api/generate` accepts `mode: 'single' | 'individual'` parameter
   - Individual mode returns array of file info with URLs
   - Files saved to temp directory with unique folder

4. **Naming Strategy**:
   - Default: Use first column values + ".pdf"
   - User can change to any column via dropdown
   - Sanitize filenames for filesystem compatibility
   - Handle empty/null values gracefully

### 🚧 Planned Features (Priority Order)

**Phase 1 - Core Missing Features**
- **Individual PDF generation** (COMPLETED)
  - ✅ Separate PDFs for each certificate
  - ✅ Custom file naming based on data columns (for downloads)
  - ✅ ZIP download for all files with custom names
  - ✅ Individual file download with custom names
  - ✅ Preview individual certificates in modal
  - ✅ Open/Download buttons for each PDF
- **Reset/Clear formatting** (COMPLETED)
  - ✅ Reset Field button to restore selected field to defaults
  - ✅ Clear All button to reset all fields formatting
  - ✅ Confirmation modals for both actions
  - ✅ Side-by-side button layout
- **Format templates** (45 mins)
  - Save/load formatting presets
  - Quick apply saved styles
- **Keyboard shortcuts** (20 mins)
  - Ctrl/Cmd + B for bold
  - Ctrl/Cmd + I for italic

**Phase 2 - Core Missing Features**
- Email functionality (SMTP, bulk sending, templates)
- Integration with individual PDFs for direct emailing

**Phase 3 - Enhanced Functionality**
- PDF template support (currently only images)
- Template management system (save/load/share)
- Advanced text formatting (text effects, shadows, outlines)

**Phase 4 - Platform Features**
- Authentication & user management (NextAuth.js)
- UI/UX improvements (mobile responsive, undo/redo)
- API development for external integrations

**Phase 5 - Advanced Features**
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

## Cleanup Plan

### Temporary Files to Clean
- `public/temp_images/` - Contains uploaded certificate templates
- `public/generated/` - Contains generated PDF certificates

### Cleanup Commands
```bash
# Clean all temporary uploaded images
rm -rf public/temp_images/*

# Clean all generated PDFs
rm -rf public/generated/*

# Docker cleanup (if using Docker)
docker-compose down
docker system prune -a  # Remove unused images
docker volume prune     # Remove unused volumes
```

### Recommended Cleanup Schedule
- **Development**: Clean temp files after each major feature test
- **Production**: Implement automated cleanup (cron job) for files older than 24 hours
- Consider implementing a cleanup API endpoint for manual cleanup
- Add file expiration metadata to track file age

### Future Improvements for File Management
- Implement automatic cleanup service
- Add file size limits and validation
- Consider moving to cloud storage (S3) for better scalability
- Add user sessions to track and cleanup user-specific files