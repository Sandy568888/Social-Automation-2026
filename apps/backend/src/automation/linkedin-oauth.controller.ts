import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../utils/crypto.util';

const prisma = new PrismaClient();
const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID!;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET!;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI!;

@Controller('linkedin')
export class LinkedinOauthController {
  @Get('connect')
  connect(@Res() res: any) {
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=w_member_social%20r_liteprofile`;
    res.redirect(url);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Req() req: any, @Res() res: any) {
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    });
    const tokenData = await tokenRes.json();

    const meRes = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = await meRes.json();
    const personUrn = `urn:li:person:${me.id}`;

    const organizationId = req.user.organizationId;

    await prisma.integration.upsert({
      where: {
        organizationId_internalId: {
          organizationId,
          internalId: personUrn,
        },
      },
      update: {
        token: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
        tokenExpiration: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : undefined,
        disabled: false,
      },
      create: {
        organizationId,
        internalId: personUrn,
        name: me.localizedFirstName ? `${me.localizedFirstName} ${me.localizedLastName ?? ''}`.trim() : 'LinkedIn',
        providerIdentifier: 'linkedin',
        type: 'social',
        token: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
        tokenExpiration: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : undefined,
      },
    });

    res.redirect('/launches?linkedin=connected');
  }
}
