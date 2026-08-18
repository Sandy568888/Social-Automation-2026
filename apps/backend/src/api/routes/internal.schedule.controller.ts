import {
  Body,
  Controller,
  HttpException,
  Post,
  Headers,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@ApiTags('Internal')
@Controller('/internal')
export class InternalScheduleController {
  constructor(
    private _postsService: PostsService,
    private _integrationService: IntegrationService
  ) {}

  @Post('/schedule-post')
  async schedulePost(
    @Headers('x-internal-secret') secret: string,
    @Headers('x-revozi-workspace-id') workspaceId: string,
    @Body()
    body: {
      platform: string;
      caption: string;
      workspace_id?: string;
      integration_id?: string;
      date?: string;
      image_urls?: string[];
    }
  ) {
    // Validate internal secret
    const expectedSecret = process.env.INTERNAL_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      throw new HttpException('Unauthorized', 401);
    }

    const orgId = workspaceId || body.workspace_id;
    if (!orgId) {
      throw new HttpException('Missing workspace_id', 400);
    }

    if (!body.caption) {
      throw new HttpException('Missing caption', 400);
    }

    // Resolve integration — caller can pass integration_id directly,
    // or we find the first active integration for the given platform
    let integration: any;

    if (body.integration_id) {
      integration = await this._integrationService.getIntegrationById(
        orgId,
        body.integration_id
      );
    } else {
      // Find first connected integration matching the platform
      const allIntegrations =
        await this._integrationService.getIntegrationsList(orgId);
      integration = allIntegrations?.find(
        (i: any) =>
          i.providerIdentifier?.toLowerCase() ===
          body.platform?.toLowerCase() &&
          i.disabled === false &&
          i.deletedAt === null
      );
    }

    if (!integration) {
      throw new HttpException(
        `No active integration found for platform: ${body.platform}`,
        404
      );
    }

    const postDate = body.date || new Date().toISOString();
    const type = body.date ? 'schedule' : 'now';

    const result = await this._postsService.createPost(
      orgId,
      {
        date: postDate,
        type,
        shortLink: false,
        tags: [],
        posts: [
          {
            integration,
            group: makeId(10),
            settings: {
              __type: integration.providerIdentifier,
            } as any,
            value: [
              {
                content: `<p>${body.caption}</p>`,
                id: makeId(10),
                delay: 0,
                image: (body.image_urls || []).map((path: string) => ({
                  id: makeId(10),
                  path,
                })),
              },
            ],
          },
        ],
      },
      'MCP'
    );

    return { success: true, posts: result };
  }
}
