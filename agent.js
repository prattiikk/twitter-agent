require('dotenv').config();
const express = require('express');
const TwitterApi = require('twitter-api-v2').default;
const axios = require("axios");
const { generateTweet } = require('./ai.js');
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;
const callbackURL = process.env.CALLBACK_URL || 'http://127.0.0.1:3000/callback';
const TWEET_TRIGGER_URL = process.env.TWEET_TRIGGER_URL || "http://localhost:3000/tweet";
const RETWEET_TRIGGER_URL = process.env.RETWEET_TRIGGER_URL || "http://localhost:3000/retweet";

const favoriteCreators = [
    "elonmusk",
];

// Persistent storage - In production, replace with a database
let tokenStorage = {};
try {
    // Optional: Load tokens from a file if available
    // tokenStorage = JSON.parse(fs.readFileSync('./tokens.json', 'utf8'));
} catch (error) {
    console.log('No saved tokens found, starting fresh');
}

// Initialize Twitter API
const twitterClient = new TwitterApi({
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
});

// Authentication state storage
const authStateStore = {};

// STEP 1 - Generate Authentication URL
app.get('/auth', async (req, res) => {
    try {
        const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(callbackURL, {
            scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
        });

        // Store code verifier for the callback
        authStateStore[state] = { codeVerifier, createdAt: Date.now() };
        
        // Clean up expired state entries
        const now = Date.now();
        Object.keys(authStateStore).forEach(key => {
            if (now - authStateStore[key].createdAt > 3600000) { // 1 hour expiry
                delete authStateStore[key];
            }
        });

        res.redirect(url);
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).send(`Error generating auth link: ${error.message}`);
    }
});

// STEP 2 - Handle Twitter Callback
app.get('/callback', async (req, res) => {
    const { state, code } = req.query;

    if (!state || !code) {
        return res.status(400).send('Missing required parameters');
    }

    if (!authStateStore[state]) {
        return res.status(400).send('Invalid or expired state parameter');
    }

    try {
        const { client, accessToken, refreshToken, expiresIn } = await twitterClient.loginWithOAuth2({
            code,
            codeVerifier: authStateStore[state].codeVerifier,
            redirectUri: callbackURL,
        });

        // Store tokens securely
        tokenStorage = { 
            accessToken, 
            refreshToken, 
            expiresAt: Date.now() + expiresIn * 1000 
        };
        
        // Optional: Save tokens to a file or database
        // fs.writeFileSync('./tokens.json', JSON.stringify(tokenStorage));

        // Clean up used state
        delete authStateStore[state];

        const { data } = await client.v2.me();
        res.send(`Authentication successful! Welcome, ${data.username}`);
    } catch (error) {
        console.error('Callback error:', error);
        res.status(500).send(`Error verifying callback: ${error.message}`);
    }
});

// Helper function to get a valid client
async function getTwitterClient() {
    if (!tokenStorage.refreshToken) {
        throw new Error('No valid refresh token found. Please authenticate first.');
    }

    try {
        // Check if token needs refresh
        if (tokenStorage.expiresAt && Date.now() > tokenStorage.expiresAt) {
            const { client, accessToken, refreshToken, expiresIn } = 
                await twitterClient.refreshOAuth2Token(tokenStorage.refreshToken);
            
            tokenStorage = { 
                accessToken, 
                refreshToken, 
                expiresAt: Date.now() + expiresIn * 1000 
            };
            
            // Optional: Save updated tokens
            // fs.writeFileSync('./tokens.json', JSON.stringify(tokenStorage));
            
            return client;
        }
        
        // Use existing token
        return new TwitterApi(tokenStorage.accessToken);
    } catch (error) {
        console.error('Token refresh error:', error);
        throw new Error('Failed to refresh token: ' + error.message);
    }
}

// STEP 3 - Post AI-generated tweet
app.get('/tweet', async (req, res) => {
    try {
        const client = await getTwitterClient();

        // Generate tweet with error handling
        let tweet;
        try {
            tweet = await generateTweet();
            if (!tweet || typeof tweet !== 'string') {
                throw new Error('Invalid tweet generated');
            }
        } catch (aiError) {
            console.error('Tweet generation error:', aiError);
            return res.status(500).send(`Error generating tweet: ${aiError.message}`);
        }

        // Format and truncate if necessary
        const formattedTweet = tweet.replace(/^"|"$/g, '').trim();
        const finalTweet =  formattedTweet;
            
        console.log("Posting tweet:", finalTweet);

        const { data } = await client.v2.tweet(finalTweet);
        res.send(`Tweet posted: ${JSON.stringify(data)}`);
    } catch (error) {
        console.error('Tweet posting error:', error);
        res.status(500).send(`Error posting tweet: ${error.message}`);
    }
});

// STEP 4 - Fetch latest tweet from a favorite creator and retweet using AI
app.get('/retweet', async (req, res) => {
    try {
        const client = await getTwitterClient();

        // Pick a random favorite creator
        const creator = favoriteCreators[Math.floor(Math.random() * favoriteCreators.length)];
        console.log(`Fetching latest tweet from: @${creator}`);

        // Fetch user data first with error handling
        let userData;
        try {
            userData = await client.v2.userByUsername(creator);
            if (!userData || !userData.data) {
                throw new Error(`Could not find user: @${creator}`);
            }
        } catch (userError) {
            console.error('User fetch error:', userError);
            return res.status(404).send(`Could not find user: @${creator}`);
        }

        // Fetch recent tweets with error handling
        let tweets;
        try {
            const timeline = await client.v2.userTimeline(userData.data.id, { 
                max_results: 5,
                exclude: 'retweets,replies'
            });
            tweets = timeline.data.data;
            
            if (!tweets || tweets.length === 0) {
                throw new Error(`No tweets found for @${creator}`);
            }
        } catch (timelineError) {
            console.error('Timeline fetch error:', timelineError);
            return res.status(404).send(`No tweets found for @${creator}: ${timelineError.message}`);
        }

        // Pick the most recent tweet
        const latestTweet = tweets.reduce((max, tweet) => 
            tweet.text.length > max.text.length ? tweet : max, tweets[0]
        );
        console.log("Longest tweet:", latestTweet.text);
        console.log(`Latest tweet from @${creator}: ${latestTweet.text}`);

        // Generate AI-powered quote tweet response with error handling
        let aiGeneratedText;
        try {
            const requestData = {
                model: "llama3.2:latest",
                prompt: `Write a witty or insightful Twitter quote retweet for this tweet: "${latestTweet.text}". The response should be concise and engaging, under 280 characters. and its a tweet only nothing else exclude hashtags as well `,
                stream: false,
            };

            const aiResponse = await axios.post(
                process.env.AI_API_URL || "http://localhost:11434/api/generate", 
                requestData, 
                { headers: { "Content-Type": "application/json" } }
            );

            aiGeneratedText = aiResponse.data.response;
            if (!aiGeneratedText || typeof aiGeneratedText !== 'string') {
                throw new Error("AI returned invalid response");
            }
            

        } catch (aiError) {
            console.error('AI generation error:', aiError);
            return res.status(500).send(`Error generating quote tweet: ${aiError.message}`);
        }

        console.log("AI-generated quote tweet:", aiGeneratedText);

        // Post the quote tweet
        try {
            const response = await client.v2.tweet(aiGeneratedText, {
                quote_tweet_id: latestTweet.id
            });

            res.send(`AI-powered Quote Tweet posted successfully! Tweet ID: ${response.data.id}`);
        } catch (tweetError) {
            console.error('Quote tweet error:', tweetError);
            res.status(500).send(`Error posting quote tweet: ${tweetError.message}`);
        }
    } catch (error) {
        console.error('Retweet route error:', error);
        res.status(500).send(`Error in retweet process: ${error.message}`);
    }
});

// Middleware for handling errors
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send(`Internal server error: ${err.message}`);
});

// Scheduled Jobs with error handling
// AI Tweet Posting - Every 2 hours
cron.schedule("0 */2 * * *", async () => {
    try {
        const response = await axios.get(TWEET_TRIGGER_URL, { timeout: 30000 });
        console.log("✅ AI Tweet posted successfully:", response.data);
    } catch (error) {
        console.error("❌ Error posting AI tweet:", 
            error.response ? error.response.data : error.message);
    }
});

// AI Retweeting - Every 3 hours
cron.schedule("0 */3 * * *", async () => {
    try {
        const response = await axios.get(RETWEET_TRIGGER_URL, { timeout: 30000 });
        console.log("✅ AI Retweet posted successfully:", response.data);
    } catch (error) {
        console.error("❌ Error posting AI retweet:", 
            error.response ? error.response.data : error.message);
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
});

console.log("🚀 Twitter bot scheduler is running...");

app.listen(PORT, () => console.log(`Server running on http://127.0.0.1:${PORT}`));