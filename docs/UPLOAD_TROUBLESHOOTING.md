# Upload Troubleshooting Guide

## Common Issues

### 1.7MB+ Files Fail on Docker but Work Locally

This is typically caused by one of these issues:

1. **Nginx proxy body size limit** (most common)
   - Default nginx limit is 1MB
   - Solution: See [NGINX_CONFIGURATION.md](./NGINX_CONFIGURATION.md)

2. **Formidable temp directory permissions**
   - Docker container may not have write access to temp directory
   - Solution: The application now creates `/app/tmp/uploads` with proper permissions

3. **Insufficient error messages**
   - Generic "under 10MB" error masks the real issue
   - Solution: Enhanced error logging now provides specific error codes

## Environment Variables

### MAX_UPLOAD_SIZE
Controls the maximum file size allowed (in bytes)
```env
# Default: 10MB (10485760 bytes)
MAX_UPLOAD_SIZE=20971520  # 20MB
```

### UPLOAD_TEMP_DIR
Custom temp directory for file uploads (useful in Docker)
```env
# Default: /app/tmp/uploads (in production)
UPLOAD_TEMP_DIR=/tmp/bamboobot-uploads
```

## Debugging Steps

1. **Check nginx configuration**
   ```bash
   # If using nginx-proxy container
   docker logs nginx-proxy | grep "client_max_body_size"
   
   # Check environment variable
   docker inspect bamboobot | grep CLIENT_MAX_BODY_SIZE
   ```

2. **Check upload logs**
   ```bash
   docker logs bamboobot | grep "Upload configuration"
   docker logs bamboobot | grep "Formidable parse error"
   ```

3. **Verify temp directory**
   ```bash
   docker exec bamboobot ls -la /app/tmp/uploads
   ```

4. **Test with curl**
   ```bash
   # Test direct upload (bypassing nginx)
   curl -X POST -F "template=@your-file.png" http://localhost:3000/api/upload
   
   # Test through nginx
   curl -X POST -F "template=@your-file.png" https://your-domain.com/api/upload
   ```

## Solutions Summary

1. **For nginx-proxy users**: Set `CLIENT_MAX_BODY_SIZE: 20M` in docker-compose.yml
2. **For manual nginx**: Add `client_max_body_size 20M;` to server block
3. **For custom temp directory**: Set `UPLOAD_TEMP_DIR` environment variable
4. **For different size limits**: Set `MAX_UPLOAD_SIZE` environment variable

## Error Messages

- **"File size exceeds maximum allowed size"**: File is too large
- **"Server configuration error: Unable to save uploaded file"**: Temp directory issue
- **"Server configuration error: Permission denied"**: File permission issue
- **"413 Request Entity Too Large"**: Nginx body size limit exceeded