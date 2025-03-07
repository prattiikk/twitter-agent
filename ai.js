require('dotenv').config();
const axios = require('axios');


const topics = [
    // Tech Deep Dives (with personality)
    "Why I'm betting on Bun over Node.js for future projects (and where it falls short)",
    "The one VSCode plugin that feels like cheating for productivity",
    "Rust is overhyped... unless you're working on *this* type of project",
    "How I hacked together a GPT-4 code reviewer for my PRs (and regretted it)",
    "Stop using 'any' in TypeScript. Here's how to actually embrace strictness.",
    "WebAssembly is quietly eating the stack. Here's why it matters.",
    "The dark art of debugging distributed systems: war stories & lessons",
    "Why your monorepo is a mess (and how to unf*** it)",

    // Hot Takes (spicy but thoughtful)
    "Next.js is becoming the new jQuery: fight me",
    "The 'AI-first' mindset is killing creativity in dev tools",
    "Open-source maintainers are not your free labor. Rant incoming.",
    "We’re overcomparing frameworks. Build something instead.",
    "Hot take: TDD is great… for tutorials. Real-world? It’s complicated.",
    "The '10x developer' is a myth. Let’s talk about the '0.1x team' instead.",

    // Underrated Tools/Practices
    "Using Obsidian for code knowledge management (not just notes)",
    "Why you should care about ASTs (and how to abuse them)",
    "The power of writing terrible code first (then refactoring later)",
    "Deno’s new feature that nobody’s talking about (but should be)",
    "How to turn Chrome DevTools into a full-stack debugging powerhouse",
    "Stop ignoring your terminal config. It’s time to zsh-ify your life.",

    // Philosophy & Career (no fluff)
    "Why 'hard work' in tech is often just poor prioritization",
    "The art of saying 'this is good enough' and shipping",
    "Why I mentor junior devs (selfishly)",
    "Career advice nobody gives: sometimes, quit faster.",
    "The paradox of 'always learning' vs. avoiding tutorial hell",
    "Why I stopped chasing 'clean code' and embraced 'clear code'",

    // Humor & Relatable Dev Life
    "When your 'quick fix' accidentally deletes prod data (a thread)",
    "The 5 stages of grief when your CI/CD pipeline breaks",
    "Why naming variables is the real final boss of programming",
    "Me: 'I’ll never touch legacy code.' Also me: debugging COBOL at 2AM",
    "When your GPT-4-generated code has a vulnerability (surprise!)",
    "The existential dread of `npm install` in a 5-year-old project",

    // Random One-Liners (viral potential)
    "Refactoring my code feels like rewriting the Matrix. No red pills.",
    "My code has fewer bugs than my dating life. Not a high bar.",
    "Spent 4 hours automating a 5-minute task. Worth it.",
    "Git commit messages: 'fix typo' vs. 'reconfigured the synergistic paradigm'",
    "When the senior dev says 'it’s trivial' and you’re 10 StackOverflow tabs deep",
    "My IDE theme is dark because my soul is tired.",
];

// Step 2: Function to pick a random topic
function getRandomTopic() {
    return topics[Math.floor(Math.random() * topics.length)];
}

// Step 3: Function to generate a tweet using your LLM API
async function generateTweet() {
    const topic = getRandomTopic();
    const requestData = {
        model: "llama3.2:latest", 
        prompt: `Write an engaging and authentic tweet about: ${topic}. reply the tweet only without any hashtags`,
        stream: false,
        // format: {
        //     type: "object",
        //     properties: {
        //         tweet: { type: "string" }
        //     },
        //     required: ["tweet"]
        // }
    };

    try {
        const response = await axios.post("http://localhost:11434/api/generate", requestData, {
            headers: { "Content-Type": "application/json" }
        });

        console.log("Generated Tweet:", response.data.response);
        return response.data.response;
    } catch (error) {
        console.error("Error generating tweet:", error.response ? error.response.data : error.message);
        return "Error generating tweet.";
    }
}

module.exports = { generateTweet }
