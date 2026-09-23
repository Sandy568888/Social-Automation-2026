import { Controller, Get, Res } from '@nestjs/common';

/**
 * H-06 FIX: This custom LinkedIn OAuth controller has been disabled.
 *
 * The original implementation had multiple critical defects:
 * - req.user.organizationId crash (no auth middleware applied, wrong property name)
 * - Custom-encrypted tokens incompatible with the worker's token contract
 * - Duplicated person URN prefix (controller built it; native provider adds it again)
 *
 * Use the native Postiz LinkedIn provider connection lifecycle instead:
 * POST /integrations/social/linkedin  (via the standard integrations flow)
 */
@Controller('linkedin')
export class LinkedinOauthController {
  @Get('connect')
  connect(@Res() res: any) {
    return res.status(410).type('text/plain').send(
      'This custom LinkedIn connection path has been disabled. ' +
      'Please connect LinkedIn through the standard integrations flow.'
    );
  }

  @Get('callback')
  callback(@Res() res: any) {
    return res.status(410).type('text/plain').send(
      'This custom LinkedIn callback has been disabled. ' +
      'Please connect LinkedIn through the standard integrations flow.'
    );
  }
}
