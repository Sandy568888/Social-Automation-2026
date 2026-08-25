import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class AiWriterService {
  private readonly logger = new Logger(AiWriterService.name);

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyPost() {
    try {
      const { title, content } = await this.generatePost();
      this.logger.log(`Generated post: ${title}`);

      const res = await fetch(
        `${process.env.BACKEND_INTERNAL_URL || 'http://localhost:3000'}/platforms/blogger/publish-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_SECRET!,
          },
          body: JSON.stringify({ title, content }),
        }
      );

      const data = await res.json();
      this.logger.log(`Daily Blogger post result: ${JSON.stringify(data)}`);
    } catch (err) {
      this.logger.error('runDailyPost failed', err as Error);
    }
  }

  async generatePost(): Promise<{ title: string; content: string }> {
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
            content: `You are a content writer for Revozi, a powerful social media automation platform that helps businesses schedule, automate, and grow their social media presence using AI. Write engaging blog posts that naturally highlight how Revozi solves social media challenges. Keep a professional but friendly tone. Always end with a call to action to try Revozi. Return ONLY valid JSON with "title" and "content" fields. Content should be HTML with h2, h3, p tags.`,
          },
          {
            role: 'user',
            content: `Write a detailed blog post about: "${topic}". Return JSON only: {"title": "...", "content": "...html..."}. Make it at least 400 words.`,
          },
        ],
        max_tokens: 1500,
        temperature: 0.8,
      }),
    });

    const data = await response.json() as any;
    const raw = data?.choices?.[0]?.message?.content || '';

    try {
      const clean = raw.replace(/```json|```/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return {
        title: 'How Revozi Transforms Your Social Media Strategy',
        content: raw || '<p>Revozi helps you automate your social media and grow your brand effortlessly. Try it today!</p>',
      };
    }
  }
}
