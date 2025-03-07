
async function getLatestTweet() {
    try {
        // Pick a random creator from the list
        const creatorId = favoriteCreators[Math.floor(Math.random() * favoriteCreators.length)];

        // Fetch latest tweets
        const { data } = await twitterClient.v2.userTimeline(creatorId, { max_results: 5 });

        if (!data || !data.data.length) {
            throw new Error("No tweets found from the creator.");
        }

        // Pick the most recent tweet
        const latestTweet = data.data[0];
        console.log("📢 Latest Tweet:", latestTweet.text);
        return latestTweet;
    } catch (error) {
        console.error("❌ Error fetching tweet:", error.message);
        return null;
    }
}