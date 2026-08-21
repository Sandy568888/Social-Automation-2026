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
            platform: process.env.AI_WRITER_PLATFORM || 'blogger',
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
    const topics = [
      'how social media automation saves time for busy entrepreneurs',
      'why consistent posting on social media grows your brand faster',
      'top strategies for growing your online presence in 2026',
      'how AI is changing the way businesses manage social media',
      'why scheduling your content in advance leads to better engagement',
      'how Revozi helps businesses automate their social media effortlessly',
      'the power of content consistency for brand growth',
      'how to use automation tools to scale your social media marketing',
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a content writer for Revozi, a powerful social media automation platform that helps businesses schedule, automate, and grow their social media presence using AI. Write engaging, informative blog posts that naturally highlight how Revozi solves social media challenges. Keep a professional but friendly tone. Always end with a call to action to try Revozi.`,
          },
          {
            role: 'user',
            content: `Write a detailed blog post about: "${topic}". Include a catchy title, an introduction, 3-4 main points with subheadings, and a conclusion with a call to action mentioning Revozi. Format it as clean HTML with h2, h3, p tags. Make it at least 400 words.`,
          },
        ],
        max_tokens: 1000,
        temperature: 0.8,
      }),
    });

    const data = await response.json() as any;
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      this.logger.error('OpenAI returned no content', data);
      return 'Revozi helps you automate your social media and grow your brand effortlessly. Try it today!';
    }

    return content;
  }
}
