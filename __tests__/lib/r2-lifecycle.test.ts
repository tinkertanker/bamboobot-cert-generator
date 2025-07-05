import { 
  uploadToR2, 
  cleanupExpiredFiles, 
  markAsEmailed, 
  getFileMetadata,
  isR2Configured 
} from '../../lib/r2-client';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('R2 Lifecycle Management', () => {
  const mockS3Client = {
    send: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock environment variables for R2
    process.env.R2_ENDPOINT = 'https://test.r2.cloudflarestorage.com';
    process.env.R2_ACCESS_KEY_ID = 'test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret-key';
    process.env.R2_BUCKET_NAME = 'test-bucket';
  });

  describe('uploadToR2 metadata assignment', () => {
    it('should automatically detect file type from path patterns', async () => {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      S3Client.mockImplementation(() => mockS3Client);
      
      mockS3Client.send.mockResolvedValue({});
      
      const testCases = [
        {
          key: 'generated/individual_123/cert.pdf',
          expectedType: 'individual',
          expectedRetention: '90d'
        },
        {
          key: 'generated/certificates_123.pdf', 
          expectedType: 'bulk',
          expectedRetention: '7d'
        },
        {
          key: 'generated/preview_abc.pdf',
          expectedType: 'preview', 
          expectedRetention: '24h'
        },
        {
          key: 'temp_images/template.png',
          expectedType: 'template',
          expectedRetention: 'permanent'
        }
      ];

      for (const testCase of testCases) {
        await uploadToR2(Buffer.from('test'), testCase.key, 'application/pdf');
        
        const lastCall = mockS3Client.send.mock.calls[mockS3Client.send.mock.calls.length - 1][0];
        const metadata = lastCall.input.Metadata;
        
        expect(metadata.type).toBe(testCase.expectedType);
        expect(metadata.retention).toBe(testCase.expectedRetention);
        expect(metadata.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(metadata.emailsent).toBe('false');
        expect(metadata.downloadcount).toBe('0');
      }
    });

    it('should allow metadata overrides', async () => {
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      S3Client.mockImplementation(() => mockS3Client);
      
      mockS3Client.send.mockResolvedValue({});
      
      const customMetadata = {
        type: 'individual' as const,
        retention: '90d' as const,
        emailSent: 'true' as const
      };

      await uploadToR2(
        Buffer.from('test'), 
        'generated/certificates_123.pdf', // Would normally be 'bulk'
        'application/pdf',
        'test.pdf',
        customMetadata
      );
      
      const lastCall = mockS3Client.send.mock.calls[mockS3Client.send.mock.calls.length - 1][0];
      const metadata = lastCall.input.Metadata;
      
      expect(metadata.type).toBe('individual'); // Override applied
      expect(metadata.retention).toBe('90d');   // Override applied  
      expect(metadata.emailsent).toBe('true');  // Override applied
    });
  });

  describe('cleanupExpiredFiles', () => {
    it('should delete files based on retention policies', async () => {
      const { S3Client, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      S3Client.mockImplementation(() => mockS3Client);
      
      const now = new Date();
      const yesterday = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago
      const lastWeek = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      const threeMonthsAgo = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

      // Mock list objects response
      mockS3Client.send.mockImplementation((command) => {
        if (command.constructor.name === 'ListObjectsV2Command') {
          return Promise.resolve({
            Contents: [
              { Key: 'generated/preview_old.pdf', LastModified: yesterday },
              { Key: 'generated/bulk_old.pdf', LastModified: lastWeek },
              { Key: 'generated/individual_old.pdf', LastModified: threeMonthsAgo },
              { Key: 'temp_images/template.png', LastModified: threeMonthsAgo }
            ]
          });
        }
        
        if (command.constructor.name === 'HeadObjectCommand') {
          const key = command.input.Key;
          if (key === 'generated/preview_old.pdf') {
            return Promise.resolve({
              Metadata: {
                type: 'preview',
                created: yesterday.toISOString(),
                retention: '24h',
                emailsent: 'false'
              }
            });
          }
          if (key === 'generated/bulk_old.pdf') {
            return Promise.resolve({
              Metadata: {
                type: 'bulk', 
                created: lastWeek.toISOString(),
                retention: '7d',
                emailsent: 'false'
              }
            });
          }
          if (key === 'generated/individual_old.pdf') {
            return Promise.resolve({
              Metadata: {
                type: 'individual',
                created: threeMonthsAgo.toISOString(), 
                retention: '90d',
                emailsent: 'false'
              }
            });
          }
          if (key === 'temp_images/template.png') {
            return Promise.resolve({
              Metadata: {
                type: 'template',
                created: threeMonthsAgo.toISOString(),
                retention: 'permanent',
                emailsent: 'false'
              }
            });
          }
        }
        
        if (command.constructor.name === 'DeleteObjectCommand') {
          return Promise.resolve({});
        }
        
        return Promise.resolve({});
      });

      const result = await cleanupExpiredFiles();

      // Should delete expired preview (24h) and bulk (7d) and individual (90d) files
      expect(result.deleted).toHaveLength(3);
      expect(result.deleted).toContain('generated/preview_old.pdf');
      expect(result.deleted).toContain('generated/bulk_old.pdf'); 
      expect(result.deleted).toContain('generated/individual_old.pdf');
      
      // Should NOT delete template (permanent)
      expect(result.deleted).not.toContain('temp_images/template.png');
      
      expect(result.errors).toHaveLength(0);
    });

    it('should not delete files marked as emailed', async () => {
      const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
      S3Client.mockImplementation(() => mockS3Client);
      
      const longAgo = new Date(new Date().getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago

      mockS3Client.send.mockImplementation((command) => {
        if (command.constructor.name === 'ListObjectsV2Command') {
          return Promise.resolve({
            Contents: [
              { Key: 'generated/individual_emailed.pdf', LastModified: longAgo }
            ]
          });
        }
        
        if (command.constructor.name === 'HeadObjectCommand') {
          return Promise.resolve({
            Metadata: {
              type: 'individual',
              created: longAgo.toISOString(),
              retention: '90d',
              emailsent: 'true' // This should prevent deletion
            }
          });
        }
        
        return Promise.resolve({});
      });

      const result = await cleanupExpiredFiles();

      // Should NOT delete emailed files even if expired
      expect(result.deleted).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('markAsEmailed', () => {
    it('should update file metadata to extend retention', async () => {
      const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
      S3Client.mockImplementation(() => mockS3Client);
      
      const mockBuffer = Buffer.from('%PDF-1.4 test content');
      
      mockS3Client.send.mockImplementation((command) => {
        if (command.constructor.name === 'HeadObjectCommand') {
          return Promise.resolve({
            Metadata: {
              type: 'individual',
              created: new Date().toISOString(),
              retention: '7d',
              emailsent: 'false'
            }
          });
        }
        
        if (command.constructor.name === 'GetObjectCommand') {
          return Promise.resolve({
            Body: {
              transformToByteArray: () => Promise.resolve(mockBuffer)
            },
            ContentType: 'application/pdf'
          });
        }
        
        if (command.constructor.name === 'PutObjectCommand') {
          return Promise.resolve({});
        }
        
        return Promise.resolve({});
      });

      await markAsEmailed('generated/individual_123/cert.pdf');

      // Should have called PutObjectCommand to update the file
      const putCalls = mockS3Client.send.mock.calls.filter(
        call => call[0].constructor.name === 'PutObjectCommand'
      );
      
      expect(putCalls).toHaveLength(1);
      
      const putCommand = putCalls[0][0];
      expect(putCommand.input.Metadata.emailsent).toBe('true');
      expect(putCommand.input.Metadata.retention).toBe('90d'); // Extended retention
    });
  });

  describe('isR2Configured', () => {
    it('should return true when all required env vars are set', () => {
      expect(isR2Configured()).toBe(true);
    });

    it('should return false when any required env var is missing', () => {
      delete process.env.R2_ENDPOINT;
      expect(isR2Configured()).toBe(false);
      
      process.env.R2_ENDPOINT = 'https://test.r2.cloudflarestorage.com';
      delete process.env.R2_ACCESS_KEY_ID;
      expect(isR2Configured()).toBe(false);
    });
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
  });
});