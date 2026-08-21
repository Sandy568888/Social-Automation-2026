import { Controller, Get, Query, Res } from '@nestjs/common';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BLOGGER_SCOPE = 'https://www.googleapis.com/auth/blogger';

const REDIRECT_URI =
  process.env.BLOGGER_REDIRECT_URI ||
  'https://api.revozi.com/api/v1/platforms/blogger/callback';

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
        return res.status(500).send('Token exchange failed — check server logs');
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
}
