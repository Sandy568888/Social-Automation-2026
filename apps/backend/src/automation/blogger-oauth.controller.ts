import { Controller, Get, Post, Body, Headers, Query, Res } from '@nestjs/common';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';
const BLOGGER_API_URL = 'https://www.googleapis.com/blogger/v3/blogs';

const REDIRECT_URI =
  process.env.BLOGGER_REDIRECT_URI ||
  'https://revozi-automation-app-production.up.railway.app/platforms/blogger/callback';

@Controller('platforms/blogger')
export class BloggerOauthController {
  @Get('auth')
  auth(@Res() res: any) {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: BLOGGER_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
    });
    res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('error') error: string, @Res() res: any) {
    if (error) return res.status(400).send(`OAuth error: ${error}`);
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

      console.log('=== BLOGGER REFRESH TOKEN (copy into Railway as BLOGGER_REFRESH_TOKEN) ===');
      console.log(tokenData.refresh_token);
      console.log('===========================================================================');

      res.send('Blogger connected. Refresh token printed to server logs — copy it into Railway.');
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
    if (secret !== process.env.INTERNAL_SECRET) {
      return { error: 'Unauthorized' };
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
    if (secret !== process.env.INTERNAL_SECRET) {
      return { error: 'Unauthorized' };
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
        console.error('SendGrid error:', res.status, errText);
        return { error: 'Email publish failed', status: res.status, details: errText };
      }

      console.log('Blogger email-publish sent via SendGrid, status:', res.status);
      return { success: true, status: res.status };
    } catch (err) {
      console.error('Blogger email-publish error:', err);
      return { error: 'Email publish failed', details: String(err) };
    }
  }

  async getAccessToken(): Promise<string> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: process.env.BLOGGER_REFRESH_TOKEN!,
        grant_type: 'refresh_token',
      }),
    });

    const data: any = await res.json();
    if (!data.access_token) throw new Error('Failed to get access token');
    return data.access_token;
  }
}
