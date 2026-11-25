'use strict';

// AI platform integration (Anthropic Claude). Included so AI-BOM scanning has something to detect.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.AI_MODEL || 'claude-sonnet-5-5';

let client;
function getClient() {
  if (!client) {
    // The key is read from the environment, never hardcoded.
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

async function summarize(text) {
  const message = await getClient().messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: `Summarize in one sentence:\n\n${text}` }],
  });
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

module.exports = { summarize, MODEL };
