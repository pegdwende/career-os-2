class OpenAiRequestError extends Error {
  constructor(message, status = 502, code = "OPENAI_REQUEST_FAILED") {
    super(message);
    this.name = "OpenAiRequestError";
    this.status = status;
    this.code = code;
  }
}

function getAdminModel() {
  return process.env.ADMIN_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function getErrorMessage(payload, fallback) {
  return payload?.error?.message || payload?.message || fallback;
}

async function callOpenAi(input, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new OpenAiRequestError("OPENAI_API_KEY is not configured.", 503, "OPENAI_API_KEY_MISSING");
  }

  const model = getAdminModel();
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        input,
        max_output_tokens: options.maxOutputTokens || 3500,
        temperature: options.temperature ?? 0.25
      })
    });
  } catch (error) {
    throw new OpenAiRequestError(`OpenAI request failed before a response was returned: ${error.message}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = getErrorMessage(payload, `OpenAI request failed with HTTP ${response.status}.`);
    throw new OpenAiRequestError(`OpenAI error using model "${model}": ${message}`, 502, "OPENAI_API_ERROR");
  }

  const text =
    payload.output_text ||
    payload.output
      ?.flatMap((item) => item.content || [])
      ?.map((item) => item.text || "")
      ?.join("\n")
      ?.trim() ||
    "";

  if (!text) {
    throw new OpenAiRequestError(`OpenAI returned an empty response using model "${model}".`);
  }

  return text;
}

function isOpenAiRequestError(error) {
  return error instanceof OpenAiRequestError || error?.code?.startsWith?.("OPENAI_");
}

module.exports = {
  callOpenAi,
  isOpenAiRequestError
};
