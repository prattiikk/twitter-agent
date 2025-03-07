require('dotenv').config();
const express = require('express');
const TwitterApi = require('twitter-api-v2').default;
const { generateTweet } = require('./ai.js')
const app = express();
const PORT = 3000;
const cron = require("node-cron");

const callbackURL = 'http://127.0.0.1:3000/callback';
const TWEET_TRIGGER_URL = "http://localhost:3000/tweet"; // Replace with your actual API URL

// Temporary in-memory storage
const db = {};

// Initialize Twitter API
const twitterClient = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
});

// STEP 1 - Generate Authentication URL
app.get('/auth', async (req, res) => {
    try {
        const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(callbackURL, {
            scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        });

        db[state] = { codeVerifier }; // Store codeVerifier in memory
        res.redirect(url);
    } catch (error) {
        res.status(500).send(`Error generating auth link: ${error.message}`);
    }
});

// STEP 2 - Handle Twitter Callback
app.get('/callback', async (req, res) => {
    const { state, code } = req.query;

    if (!db[state]) {
        return res.status(400).send('Invalid state!');
    }

    try {
        const { client, accessToken, refreshToken } = await twitterClient.loginWithOAuth2({
            code,
            codeVerifier: db[state].codeVerifier,
            redirectUri: callbackURL,
        });

        db.tokens = { accessToken, refreshToken };
        const { data } = await client.v2.me();
        res.send(`Authentication successful! Welcome, ${data.username}`);
    } catch (error) {
        res.status(500).send(`Error verifying callback: ${error.message}`);
    }
});

// STEP 3 - Post "Hello, World!" tweet
app.get('/tweet', async (req, res) => {
    if (!db.tokens || !db.tokens.refreshToken) {
        return res.status(400).send('No valid refresh token found!');
    }

    try {
        const { client, accessToken, refreshToken } = await twitterClient.refreshOAuth2Token(db.tokens.refreshToken);
        db.tokens = { accessToken, refreshToken };


        const tweet = await generateTweet();
        const formattedTweet = tweet.replace(/^"|"$/g, '');
        console.log("formatted tweet ---> ",formattedTweet); // This should remove unnecessary quotes

        const { data } = await client.v2.tweet(formattedTweet);
        res.send(`Tweet posted: ${JSON.stringify(data)}`);
    } catch (error) {
        res.status(500).send(`Error posting tweet: ${error.message}`);
    }
});



// Runs every 2 hours (adjust as needed)
cron.schedule("0 */2 * * *", async () => {
    try {
        const response = await axios.get(TWEET_TRIGGER_URL);
        console.log("✅ Tweet posted successfully:", response.data);
    } catch (error) {
        console.error("❌ Error posting tweet:", error.response ? error.response.data : error.message);
    }
});

console.log("🚀 Twitter bot scheduler is running...");

app.listen(PORT, () => console.log(`Server running on http://127.0.0.1:${PORT}`));
