/**
 * Revozi Blog Automation - Proof of Concept
 * Tests: Dev.to + Hashnode simultaneous posting
 */

const DEVTO_API_KEY = process.env.DEVTO_API_KEY || 'PASTE_DEVTO_KEY_HERE';
const HASHNODE_API_KEY = process.env.HASHNODE_API_KEY || 'd77a3436-df0f-4229-b860-923d7930cf08';
const HASHNODE_PUBLICATION_ID = process.env.HASHNODE_PUB_ID || '6a87049d4f9f04372f0208f2';

const blogPost = {
  title: 'Revozi Automation - First Automated Blog Post',
  body: `## Hello from Revozi 🚀

This post was published automatically using the **Revozi Automation Platform**.

### What is Revozi?
Revozi is an AI-powered social media and content scheduling platform that lets you post to 30+ platforms from one dashboard.

### Why Automation?
- Save time
- Stay consistent
- Scale your content across platforms

*Published at: ${new Date().toISOString()}*`,
  tags: ['automation', 'revozi', 'blogging'],
};

async function postToDevTo() {
  const start = Date.now();
  console.log('\n📝 Posting to Dev.to...');
  try {
    const res = await fetch('https://dev.to/api/articles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': DEVTO_API_KEY,
      },
      body: JSON.stringify({
        article: {
          title: blogPost.title,
          body_markdown: blogPost.body,
          published: true,
          tags: blogPost.tags,
        },
      }),
    });
    const data = await res.json();
    const elapsed = Date.now() - start;
    if (data.url) {
      console.log(`✅ Dev.to SUCCESS in ${elapsed}ms`);
      console.log(`   URL: ${data.url}`);
      return { platform: 'Dev.to', success: true, url: data.url, ms: elapsed };
    } else {
      console.log(`❌ Dev.to FAILED in ${elapsed}ms:`, JSON.stringify(data));
      return { platform: 'Dev.to', success: false, error: data, ms: elapsed };
    }
  } catch (e) {
    const elapsed = Date.now() - start;
    console.log(`❌ Dev.to ERROR in ${elapsed}ms:`, e.message);
    return { platform: 'Dev.to', success: false, error: e.message, ms: elapsed };
  }
}

async function postToHashnode() {
  const start = Date.now();
  console.log('\n📝 Posting to Hashnode...');
  try {
    const query = `
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post {
            id
            url
          }
        }
      }
    `;
    const res = await fetch('https://gql.hashnode.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': HASHNODE_API_KEY,
      },
      body: JSON.stringify({
        query,
        variables: {
          input: {
            title: blogPost.title,
            publicationId: HASHNODE_PUBLICATION_ID,
            contentMarkdown: blogPost.body,
            tags: [],
          },
        },
      }),
    });
    const data = await res.json();
    const elapsed = Date.now() - start;
    const url = data?.data?.publishPost?.post?.url;
    if (url) {
      console.log(`✅ Hashnode SUCCESS in ${elapsed}ms`);
      console.log(`   URL: ${url}`);
      return { platform: 'Hashnode', success: true, url, ms: elapsed };
    } else {
      console.log(`❌ Hashnode FAILED in ${elapsed}ms:`, JSON.stringify(data));
      return { platform: 'Hashnode', success: false, error: data, ms: elapsed };
    }
  } catch (e) {
    const elapsed = Date.now() - start;
    console.log(`❌ Hashnode ERROR in ${elapsed}ms:`, e.message);
    return { platform: 'Hashnode', success: false, error: e.message, ms: elapsed };
  }
}

async function main() {
  console.log('🚀 Revozi Blog Automation POC Starting...');
  console.log('==========================================');
  const globalStart = Date.now();

  // Post to both simultaneously
  const [devtoResult, hashnodeResult] = await Promise.all([
    postToDevTo(),
    postToHashnode(),
  ]);

  const totalMs = Date.now() - globalStart;

  console.log('\n==========================================');
  console.log('📊 RESULTS SUMMARY');
  console.log('==========================================');
  console.log(`Total time: ${totalMs}ms`);
  console.log('');
  [devtoResult, hashnodeResult].forEach(r => {
    console.log(`${r.success ? '✅' : '❌'} ${r.platform}: ${r.success ? r.url : r.error} (${r.ms}ms)`);
  });
}

main();
