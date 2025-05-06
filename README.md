# Certificate Generator

A Next.js application for generating certificates from uploaded image templates. This tool allows users to upload an image, convert it to a PDF template, add text fields with drag-and-drop positioning, and generate certificates in bulk from tabular data.

## Features

- Upload JPG/PNG images as templates
- Convert images to PDF templates
- Drag and drop text fields onto the template
- Import data from tabular formats (TSV/CSV)
- Generate multiple certificates at once
- Preview and download generated PDFs

## Getting Started

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
  - `generate.ts` - Processes certificate generation
- `public/` - Static assets and generated files
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

## Technology Stack

- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [pdf-lib](https://pdf-lib.js.org/) - PDF generation
- [formidable](https://github.com/node-formidable/formidable) - File upload handling
- [react-table](https://react-table-v7.tanstack.com/) - Data table management
- [Jest](https://jestjs.io/) - Testing framework

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
