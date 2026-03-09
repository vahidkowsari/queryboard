# Authentication Setup Guide

QueryBoard supports multiple authentication methods. You can configure one or more of the following:

- **Email/Password** - Traditional username/password authentication
- **Google OAuth** - Sign in with Google accounts
- **GitHub OAuth** - Sign in with GitHub accounts
- **Microsoft OAuth** - Sign in with Microsoft/Azure AD accounts
- **Okta SSO** - Enterprise single sign-on with Okta

## Table of Contents

- [Quick Start](#quick-start)
- [Email/Password Authentication](#emailpassword-authentication)
- [Google OAuth](#google-oauth)
- [GitHub OAuth](#github-oauth)
- [Microsoft OAuth](#microsoft-oauth)
- [Okta SSO](#okta-sso)
- [Email Domain Restrictions](#email-domain-restrictions)
- [Role Management](#role-management)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Minimum Configuration

At minimum, configure **one** authentication method:

**Option 1: Email/Password (Simplest)**
```env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password
```

**Option 2: Google OAuth (Recommended)**
```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

### Multiple Providers

You can enable multiple authentication methods simultaneously. Users will see all configured options on the login page.

---

## Email/Password Authentication

Traditional email and password authentication with automatic admin user creation.

### Configuration

Add to your `.env.local` file:

```env
# Initial Admin User (created automatically on server startup)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-secure-password-here
```

### How It Works

1. **Server Startup**: Checks if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are configured
2. **Admin Creation**: Creates the admin user automatically if it doesn't exist
3. **Role Assignment**: User is assigned the `admin` role with full access
4. **Idempotent**: Safe to run multiple times - ensures admin role if user exists

### Usage

1. Navigate to the login page
2. Enter the configured email and password
3. Click "Sign In"

### Creating Additional Users

Additional email/password users must be created through the SuperTokens dashboard or API. OAuth users can sign up normally through their respective OAuth flows.

### Security Best Practices

✅ **Use Strong Passwords**: Complex and unique  
✅ **Environment Variables**: Never commit `.env.local` to version control  
✅ **Production**: Use a secrets manager (AWS Secrets Manager, HashiCorp Vault)  
✅ **Rotate Credentials**: Change passwords periodically  

### Terraform Configuration

Add to `terraform.tfvars`:

```hcl
admin_email    = "admin@yourcompany.com"
admin_password = "your-secure-password"
```

---

## Google OAuth

Sign in with Google accounts.

### Prerequisites

- Google Cloud Platform (GCP) account
- Access to Google Cloud Console

### Setup Steps

#### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** > **New Project**
3. Enter project name (e.g., "QueryBoard")
4. Click **Create**

#### 2. Enable Google+ API

1. Go to **APIs & Services** > **Library**
2. Search for "Google+ API"
3. Click **Enable**

#### 3. Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** (or **Internal** for Google Workspace)
3. Fill in required fields:
   - **App name**: QueryBoard
   - **User support email**: Your email
   - **Authorized domains**: Your domain
   - **Developer contact**: Your email
4. Add scopes: `userinfo.email`, `userinfo.profile`, `openid`
5. Save and continue

#### 4. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Configure:
   - **Name**: QueryBoard Web Client
   - **Authorized JavaScript origins**:
     ```
     http://localhost:5173
     http://localhost:3001
     https://your-production-domain.com
     ```
   - **Authorized redirect URIs**:
     ```
     http://localhost:3001/auth/callback/google
     https://your-production-domain.com/auth/callback/google
     ```
5. Click **Create** and copy the Client ID and Client Secret

### Configuration

Add to your `.env.local` file:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

### Terraform Configuration

Add to `terraform.tfvars`:

```hcl
google_oauth_client_id     = "your-client-id.apps.googleusercontent.com"
google_oauth_client_secret = "your-client-secret"
```

### Common Issues

**"Error 400: redirect_uri_mismatch"**
- Verify redirect URI matches exactly: `http://localhost:3001/auth/callback/google`

**"This app isn't verified"**
- For development: Click "Advanced" > "Go to QueryBoard (unsafe)"
- For production: Submit app for Google verification

---

## GitHub OAuth

Sign in with GitHub accounts.

### Setup Steps

#### 1. Create OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: QueryBoard
   - **Homepage URL**: `http://localhost:5173` (or your domain)
   - **Authorization callback URL**: `http://localhost:3001/auth/callback/github`
4. Click **Register application**

#### 2. Generate Client Secret

1. Click **Generate a new client secret**
2. Copy the Client ID and Client Secret

### Configuration

Add to your `.env.local` file:

```env
GITHUB_OAUTH_CLIENT_ID=your-github-client-id
GITHUB_OAUTH_CLIENT_SECRET=your-github-client-secret
```

### Terraform Configuration

Add to `terraform.tfvars`:

```hcl
github_oauth_client_id     = "your-github-client-id"
github_oauth_client_secret = "your-github-client-secret"
```

---

## Microsoft OAuth

Sign in with Microsoft/Azure AD accounts.

### Setup Steps

#### 1. Register Application in Azure

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name**: QueryBoard
   - **Supported account types**: Choose appropriate option
   - **Redirect URI**: Web - `http://localhost:3001/auth/callback/active-directory`
5. Click **Register**

#### 2. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add description and expiration
4. Click **Add** and copy the secret value

#### 3. Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission** > **Microsoft Graph**
3. Add: `openid`, `profile`, `email`
4. Click **Grant admin consent**

### Configuration

Add to your `.env.local` file:

```env
MICROSOFT_OAUTH_CLIENT_ID=your-microsoft-client-id
MICROSOFT_OAUTH_CLIENT_SECRET=your-microsoft-client-secret
```

### Terraform Configuration

Add to `terraform.tfvars`:

```hcl
microsoft_oauth_client_id     = "your-microsoft-client-id"
microsoft_oauth_client_secret = "your-microsoft-client-secret"
```

---

## Okta SSO

Enterprise single sign-on with Okta.

### Prerequisites

- Okta account (free developer account works)
- Admin access to Okta organization

### Setup Steps

#### 1. Create Application in Okta

1. Log in to Okta Admin Console
2. Go to **Applications** > **Applications**
3. Click **Create App Integration**
4. Select **OIDC - OpenID Connect**
5. Choose **Web Application**
6. Click **Next**

#### 2. Configure Application

**General Settings:**
- **App integration name**: QueryBoard
- **Grant type**: Authorization Code, Refresh Token

**Sign-in redirect URIs:**
```
http://localhost:3001/auth/callback/okta
https://your-production-domain.com/auth/callback/okta
```

**Sign-out redirect URIs:**
```
http://localhost:5173
https://your-production-domain.com
```

3. Click **Save**
4. Copy the **Client ID**, **Client Secret**, and **Okta domain**

### Configuration

Add to your `.env.local` file:

```env
OKTA_CLIENT_ID=your-okta-client-id
OKTA_CLIENT_SECRET=your-okta-client-secret
OKTA_DOMAIN=dev-12345.okta.com
```

### Terraform Configuration

Add to `terraform.tfvars`:

```hcl
okta_client_id     = "your-okta-client-id"
okta_client_secret = "your-okta-client-secret"
okta_domain        = "dev-12345.okta.com"
```

### User Assignment

**Automatic (Development):**
- Select "Allow everyone in your organization" during setup

**Manual (Production):**
1. Go to **Applications** > Your App > **Assignments**
2. Click **Assign** > **Assign to People/Groups**
3. Select users/groups and assign

---

## Email Domain Restrictions

Restrict authentication to specific email domains.

### Configuration

Add to your `.env.local` file:

```env
ALLOWED_EMAIL_DOMAIN=yourcompany.com
```

### Behavior

- Only users with `@yourcompany.com` emails can sign in
- Applies to **all** authentication methods (OAuth and email/password)
- Admin email must also match if configured
- Users from other domains see an error after attempting to sign in

### Terraform Configuration

Add to `terraform.tfvars`:

```hcl
allowed_email_domain = "yourcompany.com"
```

---

## Role Management

### Default Role Assignment

- **First user**: Automatically assigned `admin` role
- **Subsequent users**: Assigned `viewer` role by default
- **Admin user** (email/password): Always assigned `admin` role

### Available Roles

- **admin**: Full access to all features, user management, and settings
- **editor**: Can create and edit dashboards and queries
- **viewer**: Read-only access to dashboards

### Changing Roles

Roles can be modified through:
1. Admin interface (if implemented)
2. SuperTokens dashboard
3. Direct API calls to SuperTokens

---

## Production Deployment

### Security Checklist

✅ Use HTTPS for all production URLs  
✅ Store secrets in a secrets manager (AWS Secrets Manager, HashiCorp Vault)  
✅ Enable email domain restrictions if appropriate  
✅ Use strong, unique passwords for admin accounts  
✅ Regularly rotate OAuth client secrets  
✅ Enable MFA where supported (Okta, Google Workspace)  
✅ Review and limit OAuth scopes to minimum required  

### Environment Variables

Set all required variables for your chosen authentication methods:

```env
# Database
DB_HOST=your-rds-endpoint
DB_PASSWORD=<from-secrets-manager>

# SuperTokens
SUPERTOKENS_CONNECTION_URI=http://supertokens:3567
API_DOMAIN=https://api.your-domain.com
WEBSITE_DOMAIN=https://your-domain.com

# Email/Password (optional)
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_PASSWORD=<from-secrets-manager>

# OAuth Providers (configure as needed)
GOOGLE_OAUTH_CLIENT_ID=<from-secrets-manager>
GOOGLE_OAUTH_CLIENT_SECRET=<from-secrets-manager>
GITHUB_OAUTH_CLIENT_ID=<from-secrets-manager>
GITHUB_OAUTH_CLIENT_SECRET=<from-secrets-manager>
MICROSOFT_OAUTH_CLIENT_ID=<from-secrets-manager>
MICROSOFT_OAUTH_CLIENT_SECRET=<from-secrets-manager>
OKTA_CLIENT_ID=<from-secrets-manager>
OKTA_CLIENT_SECRET=<from-secrets-manager>
OKTA_DOMAIN=yourcompany.okta.com

# Security
ALLOWED_EMAIL_DOMAIN=yourcompany.com
```

### Terraform Deployment

1. Update `terraform.tfvars` with your values
2. Apply the configuration:
   ```bash
   cd deploy/terraform
   terraform init
   terraform plan
   terraform apply
   ```

### Update Redirect URIs

For each OAuth provider, add production redirect URIs:
- Google: `https://your-domain.com/auth/callback/google`
- GitHub: `https://your-domain.com/auth/callback/github`
- Microsoft: `https://your-domain.com/auth/callback/active-directory`
- Okta: `https://your-domain.com/auth/callback/okta`

---

## Troubleshooting

### No Authentication Methods Available

**Symptoms:** Login page shows no sign-in options

**Solutions:**
1. Verify at least one auth method is configured
2. Check environment variables are loaded
3. Restart the server
4. Check server logs for configuration errors

### OAuth Redirect Errors

**Symptoms:** "redirect_uri_mismatch" or similar errors

**Solutions:**
1. Verify redirect URI matches exactly (including protocol and port)
2. Check for typos in OAuth provider configuration
3. Ensure redirect URI is added to allowed list in OAuth provider

### Email/Password Login Fails

**Symptoms:** "Invalid email or password" error

**Solutions:**
1. Verify `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set correctly
2. Check server logs for "Created initial admin user" message
3. Ensure email format is valid
4. If using `ALLOWED_EMAIL_DOMAIN`, verify admin email matches

### Domain Restriction Issues

**Symptoms:** "Only @domain accounts are allowed" error

**Solutions:**
1. Verify user email matches `ALLOWED_EMAIL_DOMAIN`
2. Remove restriction if not needed
3. Check that domain is configured correctly (no `@` symbol in env var)

### Users Can't Access After Sign In

**Solutions:**
1. Check user has been assigned a role
2. For Okta: Verify user is assigned to the application
3. Check SuperTokens logs for authentication errors
4. Verify session configuration is correct

### Multiple Providers Not Showing

**Solutions:**
1. Verify all provider credentials are configured
2. Restart server after adding new providers
3. Check browser console for frontend errors
4. Verify frontend has all required OAuth recipes initialized

---

## Additional Resources

### Documentation Links

- [SuperTokens Documentation](https://supertokens.com/docs)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [GitHub OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [Microsoft Identity Platform](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Okta Developer Docs](https://developer.okta.com/docs/)

### Support

For QueryBoard-specific issues:
1. Check server logs for detailed error messages
2. Review this documentation
3. Check the individual setup guides for each provider

For provider-specific issues:
- Refer to the provider's documentation (links above)
- Check provider status pages for outages
- Review provider-specific troubleshooting guides
