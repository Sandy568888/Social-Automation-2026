import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AiWriterService {
  private readonly logger = new Logger(AiWriterService.name);

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyPost() {
    try {
      const caption = await this.generatePost();

      const res = await fetch(
        `${process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000'}/internal/schedule-post`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_SECRET!,
            'x-revozi-workspace-id': process.env.AI_WRITER_WORKSPACE_ID!,
          },
          body: JSON.stringify({
            platform: process.env.AI_WRITER_PLATFORM || 'linkedin',
            caption,
          }),
        }
      );

      if (!res.ok) {
        const text = await res.text();
        this.logger.error(`schedule-post failed: ${res.status} ${text}`);
        return;
      }

      const data = await res.json();
      this.logger.log(`Daily post scheduled: ${JSON.stringify(data)}`);
    } catch (err) {
      this.logger.error('runDailyPost failed', err as Error);
    }
  }

  private async generatePost(): Promise<string> {
    // TODO: replace with your real OpenAI call
    return 'Placeholder AI-generated caption';
  }
}
