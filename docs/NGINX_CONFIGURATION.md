# Nginx Configuration for BambooBot

When using nginx as a reverse proxy for BambooBot, you need to configure it to handle file uploads properly.

## Required Configuration

Add the following to your nginx server block:

```nginx
server {
    listen 80;
    server_name bamboobot.yourdomain.com;
    
    # IMPORTANT: Increase client body size for file uploads
    # Default is 1MB which will cause issues with larger files
    client_max_body_size 20M;  # Adjust as needed, should be > your MAX_UPLOAD_SIZE
    
    # Increase timeouts for file processing
    proxy_connect_timeout 300;
    proxy_send_timeout 300;
    proxy_read_timeout 300;
    send_timeout 300;
    
    location / {
        proxy_pass http://bamboobot:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Ensure proper handling of large request bodies
        proxy_request_buffering off;
    }
}
```

## Common Issues

### "413 Request Entity Too Large" Error
This happens when the uploaded file exceeds nginx's `client_max_body_size`. Increase the value to match your application's requirements.

### File Upload Timeouts
Large files or slow connections may cause timeouts. Increase the timeout values as shown above.

### Docker Compose with nginx-proxy
If using the `jwilder/nginx-proxy` container, you can set the max body size via environment variable:

```yaml
services:
  bamboobot:
    environment:
      CLIENT_MAX_BODY_SIZE: 20M
```

## Verifying Configuration

After making changes:
1. Test nginx configuration: `nginx -t`
2. Reload nginx: `nginx -s reload` or `systemctl reload nginx`
3. Check nginx error logs: `tail -f /var/log/nginx/error.log`