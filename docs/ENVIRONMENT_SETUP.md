# Environment Variables Setup for Docker

This guide explains how to configure environment variables for Docker deployments.

## Overview

The application uses different environment files for different deployment scenarios:
- `.env` - General environment variables (used by docker-compose for variable substitution)
- `.env.production` - Production-specific variables (loaded into container)
- `.env.development` - Development-specific variables (loaded into container)

## Setup Instructions

### 1. Create the main .env file

This file is used by docker-compose for variable substitution (${VARIABLE_NAME} syntax):

```bash
cp .env.example .env
```

Edit `.env` and set:
```env
# For production deployment
PRODUCTION_HOST=bamboobot.yourdomain.com
LETSENCRYPT_EMAIL=your-email@example.com

# For development deployment (optional)
DEV_HOST=bamboobot-dev.yourdomain.com
```

### 2. Create environment-specific files

#### For Production:
```bash
cp .env.production.example .env.production
```

Edit `.env.production` and configure:
- Cloud storage (R2/S3) credentials
- Email service (Resend/SES) credentials
- Any production-specific settings

#### For Development:
```bash
cp .env.development.example .env.development
```

Edit `.env.development` with development settings (usually minimal).

## How It Works

1. **Variable Substitution**: Docker Compose reads `.env` file and substitutes ${VARIABLE_NAME} in docker-compose.yml
2. **Container Environment**: The `env_file` directive loads all variables from the specified file into the container
3. **Override Priority**: Variables in the `environment:` section override those from `env_file`

## Example Production Deployment

```bash
# 1. Set up your environment files
cp .env.example .env
cp .env.production.example .env.production

# 2. Edit both files with your values
nano .env  # Set PRODUCTION_HOST and LETSENCRYPT_EMAIL
nano .env.production  # Set cloud storage, email, etc.

# 3. Deploy
docker-compose up -d bamboobot
```

## Security Notes

- **NEVER** commit `.env`, `.env.production`, or `.env.development` files
- These files are listed in `.gitignore` to prevent accidental commits
- Only commit the `.example` files as templates
- Use strong, unique values for all secrets and API keys

## Environment Variables Reference

### Required for Docker Deployment
- `PRODUCTION_HOST` - Your production domain
- `DEV_HOST` - Your development domain (if using dev environment)
- `LETSENCRYPT_EMAIL` - Email for SSL certificates

### Optional Services
- **Cloud Storage**: R2 or S3 credentials
- **Email**: Resend API key or AWS SES credentials
- **Security**: CLEANUP_SECRET_KEY for protected endpoints

See `.env.production.example` for all available options.