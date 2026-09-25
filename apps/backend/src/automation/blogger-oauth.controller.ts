import * as crypto from 'crypto';
import { Controller, HttpCode, HttpStatus, Get, Post, Body, Headers, Query, Res, OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
const BLOGGER_API_URL = 'https://www.googleapis.com/blogger/v3/blogs';

const REDIRECT_URI =
  process.env.BLOGGER_REDIRECT_URI ||
  'https://revozi-automation-app-production.up.railway.app/platforms/blogger/callback';

const OAUTH_STATE_TTL = 600; // 10 minutes in seconds

@Controller('platforms/blogger')
export class BloggerOauthController implements OnModuleInit {
  private redis: ReturnType<typeof createClient>;

  async onModuleInit() {
    this.redis = createClient({ url: process.env.REDIS_URL });
    this.redis.on('error', (err) => console.error('[Blogger OAuth] Redis error', err));
    await this.redis.connect();
  }

  @Get('auth')
  async auth(@Query('orgId') orgId: string, @Res() res: any) {
    if (!orgId) return res.status(400).send('Missing orgId');
    const state = crypto.randomBytes(16).toString('hex');
    await this.redis.set(`oauth:blogger:state:${state}`, orgId, { EX: OAUTH_STATE_TTL });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: BLOGGER_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('error') error: string, @Query('state') state: string, @Res() res: any) {
    if (error) return res.status(400).type('text/plain').send('OAuth error: ' + String(error).replace(/[<>&"']/g, ''));
    const stateKey = `oauth:blogger:state:${state}`;
    const stateExists = await this.redis.get(stateKey);
    if (!state || !stateExists) return res.status(400).type('text/plain').send('Invalid or expired OAuth state');
    await this.redis.del(stateKey);
    if (!code) return res.status(400).send('Missing authorization code');

    try {
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData: any = await tokenRes.json();

      if (!tokenRes.ok) {
        console.error('Blogger token exchange failed:', tokenData);
        return res.status(500).send('Token exchange failed');
      }

      if (!tokenData.refresh_token) {
        return res.status(500).send(
          'No refresh_token returned. Revoke prior app access at ' +
          'https://myaccount.google.com/permissions, then retry /platforms/blogger/auth.'
        );
      }

      // M-02/M-03: store token in Redis keyed by org, no tmp files
      const orgId = stateExists;
      await this.redis.set(`blogger:refresh_token:${orgId}`, tokenData.refresh_token, { EX: 60 * 60 * 24 * 365 });
      console.log('[Blogger OAuth] Refresh token stored in Redis for org', orgId);
      res.send('Blogger OAuth complete for org ' + orgId + '. Token stored securely.');
    } catch (err) {
      console.error('Blogger OAuth callback error:', err);
      res.status(500).send('Unexpected error during OAuth callback');
    }
  }

  @Post('publish')
  async publishPost(
    @Headers('x-internal-secret') secret: string,
    @Body() body: { title: string; content: string }
  ) {
    if (!process.env.INTERNAL_SECRET || !secret || secret.trim().length === 0 || secret !== process.env.INTERNAL_SECRET) {
      throw new (require('@nestjs/common').UnauthorizedException)('Unauthorized');
    }

    try {
      const accessToken = await this.getAccessToken();
      const blogId = process.env.BLOGGER_BLOG_ID!;

      const res = await fetch(`${BLOGGER_API_URL}/${blogId}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          kind: 'blogger#post',
          title: body.title,
          content: body.content,
        }),
      });

      const data: any = await res.json();
      if (!res.ok) {
        console.error('Blogger publish failed:', data);
        return { error: data };
      }

      console.log('Blogger post published:', data.url);
      return { success: true, url: data.url };
    } catch (err) {
      console.error('Blogger publish error:', err);
      return { error: 'Publish failed' };
    }
  }

  @Post('publish-email')
  async publishViaEmail(
    @Headers('x-internal-secret') secret: string,
    @Body() body: { title: string; content: string }
  ) {
    if (!process.env.INTERNAL_SECRET || !secret || secret.trim().length === 0 || secret !== process.env.INTERNAL_SECRET) {
      throw new (require('@nestjs/common').UnauthorizedException)('Unauthorized');
    }

    try {
      const apiKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL;
      const bloggerPostEmail = process.env.BLOGGER_POST_EMAIL;

      if (!apiKey || !fromEmail || !bloggerPostEmail) {
        return { error: 'Missing RESEND_API_KEY, RESEND_FROM_EMAIL, or BLOGGER_POST_EMAIL config' };
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [bloggerPostEmail],
          subject: body.title,
          html: body.content,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Resend error:', res.status, errText);
        return { error: 'Email publish failed', status: res.status, details: errText };
      }

      console.log('Blogger email-publish sent via Resend, status:', res.status);
      return { success: true, status: res.status };
    } catch (err) {
      console.error('Blogger email-publish error:', err);
      return { error: 'Email publish failed', details: String(err) };
    }
  }

  async getAccessToken(orgId?: string): Promise<string> {
    // M-02/M-03: prefer org-scoped token from Redis, fall back to env var for single-tenant deployments
    let refreshToken = process.env.BLOGGER_REFRESH_TOKEN!;
    if (orgId) {
      const orgToken = await this.redis.get(`blogger:refresh_token:${orgId}`);
      if (orgToken) refreshToken = orgToken;
    }
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data: any = await res.json();
    if (!data.access_token) throw new Error('Failed to get access token');
    return data.access_token;
  }
}
