# Environment Variables Setup for Docker

This guide explains how to configure environment variables for Docker deployments.

## Overview

The application uses a single consolidated environment file for all deployment scenarios:
- `.env` - All environment variables (used by docker-compose for both variable substitution and container environment)

## Setup Instructions

### 1. Create the .env file

This file contains all configuration for your deployment:

```bash
cp .env.example .env
```

Edit `.env` and configure the following sections:

#### Docker Deployment Variables
```env
# Required for nginx proxy setup
PRODUCTION_HOST=bamboobot.yourdomain.com
DEV_HOST=bamboobot-dev.yourdomain.com  # Optional
```

#### Application Settings
```env
NODE_ENV=production  # or development
NEXT_TELEMETRY_DISABLED=1
```

#### Storage Configuration
```env
STORAGE_PROVIDER=cloudflare-r2  # or amazon-s3 or local
# Add provider-specific credentials as needed
```

#### Email Configuration
```env
# Configure Resend or Amazon SES credentials
EMAIL_FROM=certificates@yourdomain.com
```

See `.env.example` for complete configuration options and examples.

## How It Works

1. **Variable Substitution**: Docker Compose reads `.env` file and substitutes ${VARIABLE_NAME} in docker-compose.yml
2. **Container Environment**: The `env_file` directive loads all variables from the specified file into the container
3. **Override Priority**: Variables in the `environment:` section override those from `env_file`

## Example Production Deployment

```bash
# 1. Set up your environment file
cp .env.example .env

# 2. Edit with your values
nano .env  # Configure all settings in one file

# 3. Deploy
docker-compose up -d bamboobot
```

## Security Notes

- **NEVER** commit `.env` files
- This file is listed in `.gitignore` to prevent accidental commits
- Only commit the `.env.example` file as a template
- Use strong, unique values for all secrets and API keys

## Environment Variables Reference

### Required for Docker Deployment
- `PRODUCTION_HOST` - Your production domain
- `DEV_HOST` - Your development domain (if using dev environment)

### Optional Services
- **Cloud Storage**: R2 or S3 credentials
- **Email**: Resend API key or AWS SES credentials
- **Security**: CLEANUP_SECRET_KEY for protected endpoints

See `.env.example` for all available options.