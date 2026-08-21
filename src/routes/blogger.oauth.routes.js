// blogger.oauth.routes.js
// One-time OAuth consent flow to obtain a Blogger-scoped refresh token.
// Reuses existing GOOGLE_CLIENT_ID/SECRET. Mount alongside other /platforms routes.

const express = require("express");
const router = express.Router();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const BLOGGER_SCOPE = "https://www.googleapis.com/auth/blogger";

const REDIRECT_URI =
  process.env.BLOGGER_REDIRECT_URI ||
  "https://api.revozi.com/api/v1/platforms/blogger/callback";

router.get("/blogger/auth", (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: BLOGGER_SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

router.get("/blogger/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) return res.status(400).send(`OAuth error: ${error}`);
  if (!code) return res.status(400).send("Missing authorization code");

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("Blogger token exchange failed:", tokenData);
      return res.status(500).send("Token exchange failed — check server logs");
    }

    if (!tokenData.refresh_token) {
      return res.status(500).send(
        "No refresh_token returned. Revoke prior app access at " +
        "https://myaccount.google.com/permissions, then retry /blogger/auth."
      );
    }

    console.log("=== BLOGGER REFRESH TOKEN (copy into Railway) ===");
    console.log(tokenData.refresh_token);
    console.log("===================================================");

    res.send(
      "Blogger connected. Refresh token printed to server logs — copy it " +
      "into Railway as BLOGGER_REFRESH_TOKEN."
    );
  } catch (err) {
    console.error("Blogger OAuth callback error:", err);
    res.status(500).send("Unexpected error during OAuth callback");
  }
});

module.exports = router;
