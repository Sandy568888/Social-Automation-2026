import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createClient } from 'redis';

const CRON_LOCK_KEY = 'cron:leader:daily-post';
const CRON_LOCK_TTL = 60; // seconds

@Injectable()
export class AiWriterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiWriterService.name);
  private redis: ReturnType<typeof createClient>;

  async onModuleInit() {
    this.redis = createClient({ url: process.env.REDIS_URL });
    this.redis.on('error', (err) => this.logger.error('Redis error', err));
    await this.redis.connect();
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private async _acquireCronLock(): Promise<boolean> {
    // M-04: use Redis NX lock so only one replica runs the cron
    const result = await this.redis.set(CRON_LOCK_KEY, '1', {
      NX: true,
      EX: CRON_LOCK_TTL,
    });
    return result === 'OK';
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async runDailyPost() {
    const acquired = await this._acquireCronLock();
    if (!acquired) return; // another replica already has the lock
    try {
      const { title, content } = await this.generatePost();
      this.logger.log(`Generated post: ${title}`);

      const res = await fetch(
        `${process.env.BACKEND_INTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`}/platforms/blogger/publish-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_SECRET!,
          },
          body: JSON.stringify({ title, content }),
        }
      );

      if (!res.ok) {
        console.error('AI generation failed with status', res.status, '- aborting publish');
        return;
      }
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
            content: `You are a content writer for Revozi, an AI-powered reputation and review management platform that helps businesses monitor, respond to, and grow from their Google Business Profile reviews. Write SEO-focused blog posts naturally incorporating 3-4 long-tail keywords relevant to Google Business Profile, reviews, and local reputation management. Keep a professional but friendly tone. Always end with a call to action to try Revozi. Return ONLY valid JSON with "title", "content", and "tags" fields. Content should be HTML with h2, h3, p tags. "tags" should be an array of the 3-4 long-tail keywords used.`,
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

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }
    const data = await response.json() as any;
    const raw = data?.choices?.[0]?.message?.content || '';
    if (!raw) throw new Error('AI returned empty content');

    const clean = raw.replace(/```json|```/g, '').trim();
    let parsed: { title: string; content: string };
    try {
      parsed = JSON.parse(clean);
    } catch {
      throw new Error('AI returned invalid JSON');
    }
    if (!parsed.title || typeof parsed.title !== 'string' || parsed.title.trim().length === 0) {
      throw new Error('AI returned empty or missing title');
    }
    if (!parsed.content || typeof parsed.content !== 'string' || parsed.content.trim().length < 100) {
      throw new Error('AI returned empty or too-short content');
    }
    return { title: parsed.title.trim(), content: parsed.content.trim() };
  }
}
