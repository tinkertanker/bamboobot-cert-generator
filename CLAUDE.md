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

## Email Configuration

The application supports two email providers: **Resend** (default) and **Amazon SES**.

### Option 1: Resend (Recommended for simplicity)
1. **Sign up** at [Resend.com](https://resend.com)
2. **Get API key** from dashboard
3. **Set environment variables**:
   ```bash
   RESEND_API_KEY=re_xxxxx_xxxxx
   EMAIL_FROM=noreply@yourdomain.com  # Optional
   ```

### Option 2: Amazon SES (Better for high volume)
1. **Configure SES** in AWS Console (verify domain/email)
2. **Create IAM credentials** with SES send permissions
3. **Set environment variables**:
   ```bash
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=xxxxx
   AWS_SES_REGION=us-east-1  # Your SES region
   EMAIL_FROM=noreply@yourdomain.com  # Must be verified in SES
   ```

**Note:** The app auto-detects which provider to use based on configured environment variables. SES takes precedence if both are configured.

4. **Email tab** appears automatically when email column detected
5. **Configure** sender name, subject, and message before sending

## Architecture

### Component Architecture (Refactored 2024)

The application follows a clean component-based architecture with proper separation of concerns:

**Main Orchestration:**
- `app/page.tsx` (564 lines) - Main orchestration layer managing state and coordinating components

**UI Components:**
- `components/CertificatePreview.tsx` - Certificate display with drag-and-drop text positioning
- `components/panels/DataPanel.tsx` - Data input interface with CSV/TSV support
- `components/panels/FormattingPanel.tsx` - Text formatting controls (fonts, colors, alignment)
- `components/panels/EmailConfigPanel.tsx` - Email configuration settings

**Modal Components:**
- `components/modals/PdfGenerationModal.tsx` - PDF generation and preview
- `components/modals/IndividualPdfsModal.tsx` - Individual PDF management with download/email
- `components/modals/ConfirmationModals.tsx` - Reset and clear confirmation dialogs

**Foundation:**
- `types/certificate.ts` - Centralized TypeScript interfaces and type definitions
- `utils/styles.ts` - Centralized color constants and theme management
- `hooks/` - Feature-specific custom hooks for state management

### Frontend Flow
1. **Main Page** (`app/page.tsx`): Orchestrates all components and manages application state
2. **Template Upload**: Image files uploaded via `/api/upload`, converted to PDF, stored in `public/temp_images/`
3. **Text Positioning**: Drag-and-drop interface with precision controls and visual feedback
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

- **Imports**: Use `@/` alias for root imports (`@/components`, `@/lib`, `@/types`, `@/utils`)
- **Components**: React functional components with TypeScript interfaces in `types/certificate.ts`
- **Styling**: 
  - Tailwind CSS classes with centralized color constants from `utils/styles.ts`
  - shadcn/ui components with `cn()` utility
  - Use `COLORS` and `GRADIENTS` constants instead of hardcoded values
- **State**: React hooks (useState, useMemo, useCallback) with proper TypeScript typing
- **Architecture**: 
  - Extract complex UI into separate components in `components/` directory
  - Use custom hooks in `hooks/` for feature-specific logic
  - Centralize types in `types/certificate.ts`
- **Naming**: camelCase for variables/functions, PascalCase for components/interfaces
- **Error Handling**: Try-catch blocks for async operations, console.error for logging
- **Types**: All interfaces defined in `types/certificate.ts` for consistency

## Important Considerations

1. **File Storage**: 
   - Development: Uses `public/` directory
   - Production: Docker volumes mounted to `data/` directory
   - API endpoints handle dynamic file serving in production
2. **No Authentication**: The app is currently open access
3. **Advanced Text Formatting**: 
   - **7 Fonts**: Helvetica, Times, Courier, Montserrat, Poppins, Source Sans Pro, Nunito
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
- **Advanced positioning controls** (COMPLETED)
  - ✅ Center alignment snapping (2% threshold)
  - ✅ Orange animated guide lines with smooth transitions
  - ✅ Arrow key nudging (0.5% increments, Shift for 2%)
  - ✅ Visual feedback hints in UI
  - ✅ Independent horizontal/vertical snapping
  - ✅ ESC key to dismiss all modals
- **Direct file serving architecture** (COMPLETED)
  - ✅ Development: Direct /generated/ and /temp_images/ URLs
  - ✅ Production: API route fallback for Docker volumes
  - ✅ Eliminates 4MB API response limit warnings
  - ✅ Future-ready storage configuration system
  - ✅ Fixed ZIP download for both URL formats
- **Cloud Storage Support** (COMPLETED)
  - ✅ **Multi-provider support**: Cloudflare R2 and Amazon S3
  - ✅ Auto-detect provider based on environment configuration
  - ✅ Hybrid storage: templates local, outputs to cloud
  - ✅ Signed URLs with configurable expiration for security
  - ✅ Force-download API for proper file downloads
  - ✅ ZIP downloads fetch from cloud and stream to client
  - ✅ Preview vs download URL separation for optimal UX
  - ✅ CDN support: Cloudflare (R2) and CloudFront (S3)
  - ✅ Zero egress fees (R2) and standard AWS pricing (S3)
  - ✅ Environment configuration with .env.example
  - ✅ Connection testing scripts for both providers
- **Cloud Storage Lifecycle Management** (COMPLETED)
  - ✅ Metadata-based retention policies (24h, 7d, 90d, permanent)
  - ✅ Smart file type detection from path patterns
  - ✅ Email-aware retention extension (markAsEmailed function)
  - ✅ Unified cleanup API endpoint with authentication
  - ✅ Provider-specific cleanup implementations
  - ✅ Manual cleanup scripts for cron jobs
  - ✅ Test scripts for dry-run previews
  - ✅ Flexible metadata tracking for future features
  - ✅ Identical retention policies across R2 and S3

- **Email functionality** (COMPLETED)
  - ✅ Resend integration for certificate delivery
  - ✅ Configurable sender name and email subject
  - ✅ Fully customizable email messages (plain text)
  - ✅ Choice between download link or PDF attachment
  - ✅ Session-based Email configuration tab
  - ✅ Automatic email column detection
  - ✅ Integration with R2 markAsEmailed for extended retention
  - 🚧 Bulk emailing with progress tracking (remaining feature)

- **Development Mode** (COMPLETED)
  - ✅ One-click toggle in development environment only
  - ✅ Automatically loads preset certificate template image
  - ✅ Pre-fills table with sample data including email addresses
  - ✅ Pre-configures email settings (sender name, subject, message)
  - ✅ Smart timing to ensure email config persists after column detection
  - ✅ **Email Template Generator**: Enter any email (e.g., your@gmail.com) and specify count (1-100) to generate test data with Gmail+ addresses (your+1@gmail.com, your+2@gmail.com, etc.)
  - ✅ Dynamic data generation with realistic names and departments
  - ✅ Accelerates testing workflow by eliminating repetitive setup

### 🎯 Current Focus: Frontend Polish & Bulk Email

### 🚨 Large Dataset Considerations (400+ rows)

**Current Implementation Limitations:**
- No table virtualization - all rows render at once causing lag
- No pagination or search/filter functionality
- Preview navigation inefficient for large datasets
- PDF generation could timeout (300s Next.js limit)
- Email sending would hit rate limits (100/hour on Resend free tier)
- Memory usage spikes with large arrays
- ZIP downloads could crash browser

**Required Optimizations for Scale:**
1. **Table Virtualization** - Use react-window to render only visible rows
2. **Search & Pagination** - Add filtering, sorting, and 25/50/100 rows per page
3. **Progressive PDF Generation** - Process in batches of 50 with progress bar
4. **Email Queue System** - Respect rate limits with retry logic
5. **Performance Monitoring** - Track memory usage and operation times

**Performance Targets:**
- Table render: < 200ms for 400 rows
- Search/filter: < 100ms response time
- PDF generation: < 30s per 100 certificates
- Memory usage: < 200MB for 1000 rows

### 🚧 Planned Features (Priority Order)

**Phase 1 - Critical Performance & Email Features**
- **Bulk email sending with queue system** (✅ COMPLETED)
  - ✅ **Multi-provider support**: Resend (default) and Amazon SES
  - ✅ Auto-detect provider based on which API keys are configured
  - ✅ Provider-specific rate limit handling (Resend: 100/hr, SES: configurable)
  - ✅ Email queue management with provider awareness
  - ✅ Progress tracking UI with pause/resume
  - ⏳ Retry failed emails with exponential backoff (basic retry implemented, needs exponential backoff)
  - ⏳ Delivery status persistence (survives refresh) - not yet implemented
  - ✅ Batch processing respecting rate limits
  - ⏳ Email preview before bulk send - uses configured template
- **Table virtualization** (P0 - 2 days)
  - Implement react-window for large datasets
  - Only render visible rows + buffer
  - Maintain smooth 60fps scrolling
- **Search and filter** (P0 - 1 day)
  - Client-side text search across all columns
  - Column-specific filters
  - Clear all filters button

**Phase 2 - User Experience Features**
- **Format templates system** (P1 - 1 day)
  - Save current formatting as named presets
  - Default templates (Title, Body, Footer, Email)
  - Load templates from dropdown with preview
  - Store in localStorage initially
  - Import/export templates as JSON
- **Mobile responsive design** (P1 - 2 days)
  - Stacked layout for screens < 768px
  - Touch-optimized drag handles
  - Collapsible panels with swipe gestures
  - Bottom sheet for formatting options
- **Undo/Redo system** (P2 - 2 days)
  - Track position and formatting changes
  - Ctrl/Cmd + Z/Y keyboard shortcuts
  - Visual history timeline
  - Maximum 50 history states
- **Data management improvements** (P1 - 2 days)
  - Column mapping UI (drag to reorder)
  - Data validation with error highlighting
  - Bulk find & replace
  - Import CSV with preview
- **Additional keyboard shortcuts**
  - Ctrl/Cmd + S to generate PDF
  - Arrow keys to navigate table rows
  - Ctrl/Cmd + F to focus search
  - Ctrl/Cmd + A to select all text fields

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

### 🚀 Quick Wins (Can implement in < 1 day)

1. **Loading states and skeletons** (2 hours)
   - Replace blank screens with skeleton loaders
   - Show progress for long operations
   - Add cancel buttons where applicable

2. **Better error messages** (1 hour)
   - Replace generic errors with actionable messages
   - Add "Try again" buttons
   - Include troubleshooting tips

3. **Data validation warnings** (2 hours)
   - Highlight empty cells that will create blank fields
   - Validate email addresses before sending
   - Warn about duplicate entries

4. **Entry jump navigation** (1 hour)
   - Add input field to jump to specific entry number
   - Keyboard shortcut (Ctrl/Cmd + G) to open jump dialog

5. **Performance quick fixes** (2 hours)
   - Add React.memo to CertificatePreview
   - Debounce position updates (16ms for 60fps)
   - Lazy load modal components

### Implementation Notes

**For Bulk Email Implementation:**
```typescript
// Multi-provider email system
interface EmailProvider {
  name: 'resend' | 'ses';
  sendEmail: (params: EmailParams) => Promise<EmailResult>;
  getRateLimit: () => { limit: number; window: 'hour' | 'second' };
  isConfigured: () => boolean;
}

// Auto-detect provider based on env vars
const getEmailProvider = (): EmailProvider => {
  if (process.env.AWS_SES_REGION && process.env.AWS_ACCESS_KEY_ID) {
    return new SESProvider();
  }
  if (process.env.RESEND_API_KEY) {
    return new ResendProvider();
  }
  throw new Error('No email provider configured');
};

// Queue with provider-aware rate limiting
interface EmailQueue {
  items: EmailQueueItem[];
  status: 'idle' | 'processing' | 'paused';
  processed: number;
  failed: number;
  provider: 'resend' | 'ses';
  rateLimit: { 
    count: number; 
    resetAt: Date;
    limit: number; // Provider-specific limit
  };
}

// Environment variables needed:
// For Resend: RESEND_API_KEY
// For SES: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SES_REGION
// Optional: EMAIL_FROM (defaults to noreply@domain.com)
```

**For Table Virtualization:**
```typescript
// Replace current table with virtualized version
import { FixedSizeList as List } from 'react-window';

const VirtualizedTable = ({ data, columns }) => (
  <List
    height={600}
    itemCount={data.length}
    itemSize={35}
    overscanCount={5} // Render 5 extra rows for smooth scrolling
  >
    {({ index, style }) => (
      <div style={style}>
        <TableRow data={data[index]} columns={columns} />
      </div>
    )}
  </List>
);
```

### Technical Considerations for Future Development
- **Email Service**: ✅ Multi-provider support (Resend + Amazon SES) with automatic detection
- **Storage**: ✅ Using Cloudflare R2 (implemented)
- **Database**: Will need PostgreSQL/MongoDB for user management and templates
- **Background Jobs**: ✅ In-memory queue implemented (consider Redis/BullMQ for production)
- **Deployment**: Docker containers on VPS, Vercel, or cloud providers

## Common Development Tasks

When implementing new features:
1. Check the planned features section above for requirements
2. Follow the existing pattern of client-side UI with server-side PDF processing
3. Add appropriate tests for new functionality
4. Ensure TypeScript types are properly defined
5. Consider scalability implications (especially for file storage and email sending)

## Cleanup Plan

### Current Storage Architecture (Pre-R2)

**Development Environment:**
- Files served directly from `public/` directory
- No API size limits, faster serving

**Production Environment:**
- Files served via API routes from Docker volumes
- Maintains compatibility with existing deployments

### Temporary Files to Clean

**Local Development:**
- `public/temp_images/` - Contains uploaded certificate templates
- `public/generated/` - Contains generated PDF certificates

**Docker Production:**
- `./data/temp_images/` - Mounted volume for templates
- `./data/generated/` - Mounted volume for generated PDFs

### Cleanup Commands

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

### Post-R2 Migration Cleanup Strategy

**With Cloudflare R2:**
- Files stored in cloud with automatic CDN
- Implement R2 lifecycle rules for auto-deletion
- Local files only used as temporary upload staging
- Reduced local storage requirements

**Recommended R2 Lifecycle:**
- Generated PDFs: Delete after 7 days
- Template images: Delete after 30 days (unless saved to templates)
- Individual certificates: Delete after 24 hours

### Cleanup Schedule
- **Development**: Manual cleanup after testing sessions
- **Production (current)**: Implement cron job for files older than 24 hours
- **Production (post-R2)**: Automated via R2 lifecycle rules
- **Docker**: Clean volumes during maintenance windows