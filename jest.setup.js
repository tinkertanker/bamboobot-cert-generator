// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

// Mock next/navigation hooks
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    pathname: '/',
    query: {},
  })),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

// Mock the global fetch
global.fetch = jest.fn();

// Mock URL.createObjectURL and URL.revokeObjectURL for blob handling
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

// Mock Blob.arrayBuffer method which is not available in Node.js
if (!global.Blob.prototype.arrayBuffer) {
  global.Blob.prototype.arrayBuffer = jest.fn(function() {
    return Promise.resolve(new ArrayBuffer(8));
  });
}

// Mock File.text method which is not available in Node.js
if (!global.File.prototype.text) {
  global.File.prototype.text = jest.fn(function() {
    return Promise.resolve('mock file content');
  });
}