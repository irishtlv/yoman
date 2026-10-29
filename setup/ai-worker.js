/* Cloudflare Worker: keeps the Claude API key secret and answers the app's AI requests.
   Settings → Variables: add a Secret named ANTHROPIC_API_KEY. */
const ALLOWED_ORIGIN = "https://irishtlv.github.io";
const MODELS = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5" };

export default {
  async fetch(req, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST" || req.headers.get("Origin") !== ALLOWED_ORIGIN) return new Response("Forbidden", { status: 403, headers: cors });
    const { prompt, images = [], tier = "default" } = await req.json();
    if (!prompt || prompt.length > 60000 || images.length > 4) return new Response("Bad request", { status: 400, headers: cors });
    const content = images.map(i => ({ type: "image", source: { type: "base64", media_type: i.type, data: i.data } }));
    content.push({ type: "text", text: prompt });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELS[tier] || MODELS.default, max_tokens: 4000, messages: [{ role: "user", content }] })
    });
    if (!r.ok) return new Response(JSON.stringify({ error: r.status }), { status: r.status === 429 ? 429 : 502, headers: { ...cors, "Content-Type": "application/json" } });
    const j = await r.json();
    const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    return new Response(JSON.stringify({ text }), { headers: { ...cors, "Content-Type": "application/json" } });
  }
};
