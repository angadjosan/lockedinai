const Anthropic = require("@anthropic-ai/sdk");

const ROAST_PERSONAS = {
  gentle:
    "You're a supportive but slightly disappointed friend. Use mild teasing — " +
    "think a coworker who raises one eyebrow. Keep it warm but make the point.",
  medium:
    "You're a sarcastic best friend who genuinely wants them to succeed but " +
    "has zero filter. Think dry wit, specific call-outs, and the kind of honesty " +
    "that stings because it's true.",
  brutal:
    "You're a drill sergeant crossed with a stand-up comedian. No mercy, no " +
    "sugar-coating. Roast what you SEE on their screen with laser precision. " +
    "Be savage but clever — cheap shots are beneath you.",
  unhinged:
    "You are completely unhinged. Channel chaotic energy — absurd metaphors, " +
    "dramatic overreactions, existential dread about their life choices. You " +
    "saw their screen and you are SHOOK. Go full theatrics. Make it so funny " +
    "they can't even be mad.",
};

function buildPrompt(taskContext, roastLevel, hasCamera) {
  const persona = ROAST_PERSONAS[roastLevel] || ROAST_PERSONAS.medium;

  const cameraInstructions = hasCamera
    ? `\n\nIMPORTANT: You also have a webcam image of the user. Look for:\n` +
      `- Are they looking at their PHONE instead of their screen? This is an instant fail.\n` +
      `- Are they even at their desk? If the chair is empty, roast them for disappearing.\n` +
      `- Are they NOT LOOKING AT THE SCREEN? If their eyes/face are turned away, looking ` +
      `to the side, looking down at something else, or they're clearly not focused on ` +
      `their monitor — that's a fail. Call them out for not even paying attention.\n` +
      `- Are they looking distracted, sleepy, or zoned out? Eyes half-closed = roast.\n` +
      `If they're on their phone, make the roast about phone addiction.\n` +
      `If they're looking away from the screen, roast them for not even pretending to work.`
    : '';

  return (
    `You are the AI brain of "Locked In AI", a productivity monitor app. ` +
    `The user told you they should be working on: "${taskContext}"\n\n` +
    `Your personality for this roast level (${roastLevel}):\n${persona}\n\n` +
    `Analyze the screenshot of their screen. Determine:\n` +
    `1. What they are ACTUALLY doing (be specific — name the app, website, content)\n` +
    `2. Whether this is productive relative to their stated task\n` +
    `3. Craft a roast or encouragement based on what you see\n` +
    cameraInstructions + `\n\n` +
    `Rules for your message:\n` +
    `- Reference SPECIFIC things visible on screen (tab titles, app names, content)\n` +
    `- If they're on Reddit, mention the subreddit. If YouTube, mention the video topic.\n` +
    `- If they're on their phone (visible in webcam), call them OUT hard.\n` +
    `- If they're actually working, acknowledge it — but keep your persona's tone.\n` +
    `- One to two sentences max. Punchy. No filler.\n` +
    `- Do NOT be generic. "You're not working" is boring. "You have 3 Stack Overflow ` +
    `tabs open and none of them are related to your React project" is gold.\n\n` +
    `Respond with ONLY valid JSON (no markdown, no code fences):\n` +
    `{"productive": <true or false>, "activity": "<brief factual description of what's on screen>", "message": "<your roast or encouragement>"}`
  );
}

function createAIService(apiKey) {
  const client = new Anthropic({ apiKey });

  async function analyzeScreenshot(screenshotBase64, taskContext, roastLevel, cameraBase64) {
    try {
      const contentBlocks = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: screenshotBase64,
          },
        },
      ];

      // Add webcam frame if available
      if (cameraBase64) {
        contentBlocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: cameraBase64,
          },
        });
      }

      contentBlocks.push({
        type: "text",
        text: buildPrompt(taskContext, roastLevel, !!cameraBase64),
      });

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: contentBlocks,
          },
        ],
      });

      const text = response.content[0].text.trim();
      const result = JSON.parse(text);

      // Validate expected shape
      if (
        typeof result.productive !== "boolean" ||
        typeof result.activity !== "string" ||
        typeof result.message !== "string"
      ) {
        throw new Error("Response missing required fields");
      }

      return result;
    } catch (err) {
      console.error("[LockedInAI] Analysis failed:", err.message || err);

      return {
        productive: false,
        activity: "Unable to analyze screen",
        message:
          "My vision is blurry right now — but I'm watching you. Get back to work.",
      };
    }
  }

  return { analyzeScreenshot };
}

module.exports = { createAIService };
