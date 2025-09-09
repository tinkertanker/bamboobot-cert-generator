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

// Mock next/router for Pages Router components
jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    pathname: '/',
    query: {},
  })),
}));

// Mock the global fetch
global.fetch = jest.fn();

// Force server-persistence OFF in tests to keep existing unit tests in local mode
process.env.NEXT_PUBLIC_PROJECT_SERVER_PERSISTENCE = 'false';
process.env.PROJECT_SERVER_PERSISTENCE = 'false';

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
// Mock next-auth/react for component tests
jest.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: jest.fn(() => ({ status: 'unauthenticated' })),
  SessionProvider: ({ children }) => children,
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

// Mock authOptions module to avoid executing NextAuth in tests
jest.mock('@/pages/api/auth/[...nextauth]', () => ({
  __esModule: true,
  authOptions: {},
}), { virtual: true });
