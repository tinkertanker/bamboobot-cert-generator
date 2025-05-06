# Testing Documentation

This directory contains the unit tests for the Certificate Generator application.

## Setup

Before running the tests, make sure to install the required dependencies:

```bash
npm install --save-dev jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom @types/jest ts-jest
```

## Running Tests

To run all tests:

```bash
npm test
```

To run tests in watch mode (useful during development):

```bash
npm run test:watch
```

## Test Structure

The tests are organized into the following directories:

- `__tests__/api/`: Tests for API endpoints
  - `upload.test.ts`: Tests for the upload endpoint
  - `generate.test.ts`: Tests for the certificate generation endpoint
- `__tests__/components/`: Tests for React components
  - `Spinner.test.tsx`: Tests for the Spinner component
  - `ui/button.test.tsx`: Tests for the Button component
- `__tests__/lib/`: Tests for utility functions
  - `utils.test.ts`: Tests for the utility functions

## Mocking Strategy

The tests use Jest's mocking capabilities to mock external dependencies:

- File system operations (`fs` and `fs/promises`)
- Path operations (`path`)
- PDF generation (`pdf-lib`)
- Form data handling (`formidable`)

## Adding New Tests

When adding new tests, follow these guidelines:

1. Create a new test file in the appropriate directory
2. Import the component or function being tested
3. Mock any external dependencies
4. Write test cases using `describe` and `it` functions
5. Run the tests to ensure they pass

## Coverage

To run tests with coverage reporting:

```bash
npm test -- --coverage
```

This will generate a coverage report in the `coverage` directory.