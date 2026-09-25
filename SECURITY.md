# Security Policy

## Credential Rotation

If any credentials are suspected to be compromised, rotate them immediately:

1. **BLOGGER_REFRESH_TOKEN**: Re-run `/platforms/blogger/auth?orgId=<orgId>` to generate a new token. The old token in Redis is overwritten automatically.
2. **INTERNAL_SECRET**: Update the env var on Railway and redeploy. All internal endpoints reject requests with the old secret immediately.
3. **GOOGLE_CLIENT_SECRET**: Rotate in Google Cloud Console, update Railway env vars, then re-run the Blogger OAuth flow per org.
4. **RESEND_API_KEY**: Rotate in Resend dashboard, update Railway env var.
5. **Redis**: If Redis is compromised, flush all keys (`redis-cli FLUSHALL`) and re-run OAuth flows for all orgs to re-issue tokens.

After rotating any credential, verify by triggering a test publish and checking logs for auth errors.

## History Cleanup Scope

The history cleanup job removes post records older than the configured retention window (default 90 days). It does NOT delete:
- Organization or user records
- Integration credentials
- Billing history

## Demo / Simulated Output

Any AI-generated post previews shown in the UI before publishing are simulated output and do not represent real published content. They are clearly labelled in the response payload with `"simulated": true`.
