const nextJest = require('next/jest');

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/__tests__/__mocks__/', // Exclude mock files from test discovery
    '<rootDir>/e2e/', // Exclude Playwright tests from Jest
  ],
  moduleNameMapper: {
    // Handle module aliases (this will be automatically configured for you soon)
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/pages/(.*)$': '<rootDir>/pages/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    // Mock AWS SDK modules for testing
    '^@aws-sdk/client-s3$': '<rootDir>/__tests__/__mocks__/@aws-sdk/client-s3.ts',
    '^@aws-sdk/s3-request-presigner$': '<rootDir>/__tests__/__mocks__/@aws-sdk/s3-request-presigner.ts',
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig);