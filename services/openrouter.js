require("dotenv").config({ quiet: true });

const config = require("../utils");

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const DEFAULT_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_API_TIMEOUT_MS = 30000;
const MIN_API_TIMEOUT_MS = 3000;

function getApiConfig() {
  return config.api || {};
}

function getApiTimeoutMs() {
  const configured = Number(getApiConfig().timeoutMs);
  if (Number.isNaN(configured)) {
    return 20000;
  }
  return Math.min(MAX_API_TIMEOUT_MS, Math.max(MIN_API_TIMEOUT_MS, configured));
}

function isApiEnabled() {
  return getApiConfig().enabled !== false;
}

function getHeaders() {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
  };

  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
  }

  const appName = process.env.OPENROUTER_APP_NAME || config.bot?.name || "WhatsApp Bot";
  if (appName) {
    headers["X-Title"] = appName;
  }

  return headers;
}

function isTimeoutError(err) {
  return err?.name === "TimeoutError" || err?.name === "AbortError";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractOpenRouterReply(payload) {
  if (typeof payload === "string") {
    return payload.trim() || null;
  }

  const firstChoice = payload?.choices?.[0];
  const content = firstChoice?.message?.content;

  if (typeof content === "string") {
    return content.trim() || null;
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join(" ")
      .trim();
    return text || null;
  }

  if (typeof firstChoice?.text === "string") {
    return firstChoice.text.trim() || null;
  }

  if (typeof payload?.reply === "string") return payload.reply.trim() || null;
  if (typeof payload?.message === "string") return payload.message.trim() || null;
  if (typeof payload?.text === "string") return payload.text.trim() || null;
  return null;
}

async function requestOpenRouter(
  userText,
  logger,
  {
    systemPrompt = "You are a helpful WhatsApp bot assistant. Respond concisely and naturally. Keep responses short. Do not use markdown.",
    temperature = 0.7,
    maxTokens = 200,
    maxAttempts = 2,
  } = {}
) {
  if (!isApiEnabled()) {
    return { reply: null, reason: "disabled" };
  }

  if (!process.env.OPENROUTER_API_KEY) {
    logger?.warn("OpenRouter API key not found in environment.");
    return { reply: null, reason: "missing_key" };
  }

  const apiUrl = getApiConfig().url || DEFAULT_URL;
  const timeoutMs = getApiTimeoutMs();
  const headers = getHeaders();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userText,
            },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const responseText = await response.text();
        logger?.warn(
          `OpenRouter API returned ${response.status}: ${responseText.slice(0, 180)}`
        );
        if (response.status >= 500 && attempt < maxAttempts) {
          await sleep(500);
          continue;
        }
        return { reply: null, reason: `http_${response.status}` };
      }

      const payload = await response.json();
      const reply = extractOpenRouterReply(payload);
      if (reply) {
        return { reply, reason: null };
      }

      if (payload?.error?.message) {
        logger?.warn(`OpenRouter payload error: ${payload.error.message}`);
        return { reply: null, reason: "api_error" };
      }

      return { reply: null, reason: "empty_response" };
    } catch (err) {
      logger?.warn(`OpenRouter API request failed: ${err.message || err}`);
      if (isTimeoutError(err) && attempt < maxAttempts) {
        await sleep(500);
        continue;
      }
      return { reply: null, reason: isTimeoutError(err) ? "timeout" : "request_failed" };
    }
  }

  return { reply: null, reason: "request_failed" };
}

module.exports = {
  isApiEnabled,
  requestOpenRouter,
};
