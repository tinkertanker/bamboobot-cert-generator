// Mock S3 request presigner for testing
export const getSignedUrl = jest.fn().mockResolvedValue('https://mock-signed-url.com/test.pdf');