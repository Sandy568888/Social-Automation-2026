// blogger.service.js
// Handles OAuth token refresh + publishing posts to Blogger via API v3.
// Reuses the existing Google OAuth client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)
// already used for GMB/YouTube in this project — just needs its own refresh token
// scoped to the Blogger API (obtained via the one-time OAuth flow, see blogger.routes.js).

const BLOGGER_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BLOGGER_API_BASE = "https://www.googleapis.com/blogger/v3";

class BloggerService {
  constructor({
    clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    refreshToken = process.env.BLOGGER_REFRESH_TOKEN,
    blogId = process.env.BLOGGER_BLOG_ID,
  } = {}) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.blogId = blogId;

    this._accessToken = null;
    this._accessTokenExpiresAt = 0;
  }

  _assertConfigured() {
    const missing = [];
    if (!this.clientId) missing.push("GOOGLE_CLIENT_ID");
    if (!this.clientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (!this.refreshToken) missing.push("BLOGGER_REFRESH_TOKEN");
    if (!this.blogId) missing.push("BLOGGER_BLOG_ID");
    if (missing.length) {
      throw new Error(`BloggerService is missing required config: ${missing.join(", ")}`);
    }
  }

  async _getAccessToken() {
    this._assertConfigured();

    const now = Date.now();
    if (this._accessToken && now < this._accessTokenExpiresAt - 60_000) {
      return this._accessToken;
    }

    const res = await fetch(BLOGGER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Blogger token refresh failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    this._accessToken = data.access_token;
    this._accessTokenExpiresAt = now + data.expires_in * 1000;
    return this._accessToken;
  }

  async createPost({ title, content, labels = [] }) {
    if (!title || !content) {
      throw new Error("createPost requires both title and content");
    }

    const accessToken = await this._getAccessToken();

    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${this.blogId}/posts/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "blogger#post", title, content, labels }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Blogger post creation failed (${res.status}): ${body}`);
    }

    const post = await res.json();
    return { id: post.id, url: post.url, published: post.published };
  }

  async createDraft({ title, content, labels = [] }) {
    if (!title || !content) {
      throw new Error("createDraft requires both title and content");
    }

    const accessToken = await this._getAccessToken();

    const res = await fetch(`${BLOGGER_API_BASE}/blogs/${this.blogId}/posts/?isDraft=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "blogger#post", title, content, labels }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Blogger draft creation failed (${res.status}): ${body}`);
    }

    return res.json();
  }
}


  async publishViaEmail({ title, content }) {
    const nodemailer = require("nodemailer");

    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;
    const bloggerPostEmail = process.env.BLOGGER_POST_EMAIL;

    if (!gmailUser || !gmailAppPassword || !bloggerPostEmail) {
      throw new Error(
        "publishViaEmail is missing required config: GMAIL_USER, GMAIL_APP_PASSWORD, or BLOGGER_POST_EMAIL"
      );
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    const info = await transporter.sendMail({
      from: gmailUser,
      to: bloggerPostEmail,
      subject: title,
      html: content,
    });

    return { messageId: info.messageId, accepted: info.accepted };
  }

module.exports = { BloggerService };
