// Manual mock for session-manager
export const mockCreateSession = jest.fn();
export const mockGetSession = jest.fn();
export const mockRemoveSession = jest.fn();

export const PdfSessionManager = {
  getInstance: jest.fn(() => ({
    createSession: mockCreateSession,
    getSession: mockGetSession,
    removeSession: mockRemoveSession
  }))
};