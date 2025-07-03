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
- **Docker Support** - Production-ready containerization with development hot reload

## Getting Started

### Option 1: Docker (Recommended)

**Production Mode:**
```bash
# Build and run production version
docker-compose up -d
# Access at http://localhost:3000
```

**Development Mode (with hot reload):**
```bash
# Build and run development version with hot reload
docker-compose -f docker-compose.dev.yml up -d
# Access at http://localhost:3001
# Code changes will automatically reload
```

### Option 2: Local Development

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

> **Note:** For the best development experience, we recommend using the Docker development setup above, which provides hot reload and ensures environment consistency.

## How to Use

1. **Upload Template**: Drag & drop or select a JPG/PNG image
2. **Add Data**: Paste TSV/CSV data in the Data section (toggle "Treat first row as header" if needed)
3. **Position Text**: Drag text fields to desired positions on the template
4. **Format Text**: Click any text field to open formatting controls
   - Adjust font size with slider (8-72px) or number input
   - Select font family (Helvetica, Times, Courier)
   - Toggle bold and italic styling
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

## Project Structure

- `app/` - Next.js app router components
- `components/` - Reusable UI components
- `lib/` - Utility functions
- `pages/api/` - API endpoints
  - `upload.ts` - Handles image upload and PDF conversion
  - `generate.ts` - Processes certificate generation with positioned text
  - `zip-pdfs.ts` - Creates ZIP archives of individual PDFs with custom filenames
  - `files/` - Dynamic file serving endpoints for production
    - `temp_images/[filename].ts` - Serves uploaded images
    - `generated/[filename].ts` - Serves generated PDFs
- `public/` - Static assets
- `data/` - Docker volume mount for persistent storage
  - `temp_images/` - Uploaded templates
  - `generated/` - Generated certificate PDFs

## Testing

This project uses Jest and React Testing Library for unit and component testing.

To run the tests:

```bash
npm test
```

For continuous testing during development:

```bash
npm run test:watch
```

The test suite includes:

- API endpoint tests
- Component tests
- Utility function tests
- Page integration tests

## Docker Deployment

The application includes both production and development Docker configurations:

**Production Deployment:**
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

**Development with Hot Reload:**
```bash
# Start development server with hot reload
docker-compose -f docker-compose.dev.yml up -d

# View development logs
docker-compose -f docker-compose.dev.yml logs -f cert-generator-dev

# Stop development server
docker-compose -f docker-compose.dev.yml down
```

### Docker Features:
- **Development Mode**: Hot reload, instant code changes, port 3001
- **Production Mode**: Optimized build, smaller image, port 3000
- Multi-stage build for optimized image size
- Non-root user for security
- Volume mounts for persistent file storage
- Health checks and auto-restart
- Alpine Linux base for minimal footprint

### Quick Development Workflow:
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
- [Docker](https://www.docker.com/) - Containerization for production
- [Jest](https://jestjs.io/) - Testing framework

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

## Cleanup

### Temporary Files
```bash
# Clean all temporary uploaded images
rm -rf public/temp_images/*

# Clean all generated PDFs
rm -rf public/generated/*

# Docker cleanup
docker-compose down
docker system prune -a  # Remove unused images
docker volume prune     # Remove unused volumes
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.