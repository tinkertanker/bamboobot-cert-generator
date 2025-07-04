// Mock AWS SDK for testing
export const S3Client = jest.fn(() => ({
  send: jest.fn().mockResolvedValue({}),
}));

export const PutObjectCommand = jest.fn();
export const GetObjectCommand = jest.fn();
export const DeleteObjectCommand = jest.fn();