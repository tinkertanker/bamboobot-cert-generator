# Certificate Generator

A Next.js application for generating certificates from uploaded image templates. This tool allows users to upload an image, convert it to a PDF template, add text fields with drag-and-drop positioning, and generate certificates in bulk from tabular data.

## Features

- **Image Template Upload** - Support for JPG/PNG images with automatic PDF conversion
- **Drag & Drop File Upload** - Intuitive file upload with visual feedback
- **Precision Text Positioning** - Pointer-based drag system with visual feedback
- **Bulk Data Import** - TSV/CSV support with header row toggle
- **Batch Certificate Generation** - Generate multiple certificates from tabular data
- **Live Preview** - Real-time preview matching final PDF output
- **Docker Support** - Production-ready containerization

## Getting Started

### Option 1: Docker (Recommended for Production)

```bash
# Using Docker Compose
docker-compose up -d

# Or using Docker directly
docker build -t cert-generator .
docker run -p 3000:3000 cert-generator
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

## Project Structure

- `app/` - Next.js app router components
- `components/` - Reusable UI components
- `lib/` - Utility functions
- `pages/api/` - API endpoints
  - `upload.ts` - Handles image upload and PDF conversion
  - `generate.ts` - Processes certificate generation with positioned text
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

The application includes production-ready Docker configuration:

```bash
# Build and run with Docker Compose (recommended)
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f cert-generator

# Stop the application
docker-compose down
```

### Docker Features:
- Multi-stage build for optimized image size
- Non-root user for security
- Volume mounts for persistent file storage
- Health checks and auto-restart
- Alpine Linux base for minimal footprint

## Technology Stack

- [Next.js 14](https://nextjs.org/) - React framework with App Router
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [pdf-lib](https://pdf-lib.js.org/) - PDF manipulation and generation
- [formidable](https://github.com/node-formidable/formidable) - File upload handling
- [react-table](https://react-table-v7.tanstack.com/) - Data table management
- [shadcn/ui](https://ui.shadcn.com/) - Modern UI components
- [Docker](https://www.docker.com/) - Containerization for production
- [Jest](https://jestjs.io/) - Testing framework

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
