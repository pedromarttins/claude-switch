/**
 * claude-proxy.js
 * Pass-through proxy for Claude Code → DeepSeek Anthropic-compatible endpoint.
 * Logs requests, token consumption, and errors for benchmarking.
 *
 * Usage:
 *   node claude-proxy.js               # silent
 *   node claude-proxy.js --debug       # verbose logging
 *   PROXY_DEBUG=true node claude-proxy.js
 *
 * Point ANTHROPIC_BASE_URL at http://127.0.0.1:3334
 */

const http  = require('http');
const https = require('https');

// ── Debug ────────────────────────────────────────────────────────────────────
const DEBUG = process.argv.includes('--debug') ||
              process.env.PROXY_DEBUG === 'true' ||
              process.env.DEBUG === 'true';

function log(...args)   { if (DEBUG) console.log(...args); }

// ── Config ───────────────────────────────────────────────────────────────────
const PORT           = parseInt(process.env.PROXY_PORT || '3334', 10);
const UPSTREAM_HOST  = 'api.deepseek.com';
const UPSTREAM_BASE  = '/anthropic';
const DEEPSEEK_KEY   = process.env.DEEPSEEK_API_KEY;

if (!DEEPSEEK_KEY) {
  console.error('[claude-proxy] ERROR: DEEPSEEK_API_KEY not set.');
  process.exit(1);
}

// ── Stats ────────────────────────────────────────────────────────────────────
const stats = { requests: 0, inputTokens: 0, outputTokens: 0, errors: 0, start: Date.now() };

function printStats() {
  const elapsed = ((Date.now() - stats.start) / 1000).toFixed(0);
  console.log(`\n[claude-proxy] ── Session stats (${elapsed}s) ──`);
  console.log(`  Requests:      ${stats.requests}`);
  console.log(`  Input tokens:  ${stats.inputTokens}`);
  console.log(`  Output tokens: ${stats.outputTokens}`);
  console.log(`  Total tokens:  ${stats.inputTokens + stats.outputTokens}`);
  console.log(`  Errors:        ${stats.errors}`);
  console.log(`  Avg in/req:    ${stats.requests ? Math.round(stats.inputTokens / stats.requests) : 0}`);
  console.log(`  Avg out/req:   ${stats.requests ? Math.round(stats.outputTokens / stats.requests) : 0}`);
}

process.on('SIGINT',  () => { printStats(); process.exit(); });
process.on('SIGTERM', () => { printStats(); process.exit(); });
process.on('exit',    () => { /* clean exit */ });

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseStreamTokens(chunk) {
  // Anthropic SSE events with usage info:
  //   message_start → usage.input_tokens
  //   message_delta → usage.output_tokens
  //   message_stop  → cumulative usage
  try {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = JSON.parse(line.slice(6));
      if (!data || !data.type) continue;
      if (data.type === 'message_start' && data.message?.usage?.input_tokens) {
        stats.inputTokens += data.message.usage.input_tokens;
      }
      if (data.type === 'message_delta' && data.usage?.output_tokens) {
        stats.outputTokens += data.usage.output_tokens;
      }
      if (data.type === 'message_stop') {
        // Nothing extra to count — message_delta already covered output
      }
    }
  } catch { /* malformed SSE line */ }
}

// ── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer((req, clientRes) => {
  const method = req.method;
  const url    = req.url;

  log(`[claude-proxy] ${method} ${url}`);

  // ── GET /health ────────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/health') {
    clientRes.writeHead(200, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({ status: 'ok', proxy: 'claude-proxy', stats }));
    return;
  }

  // ── GET /stats ─────────────────────────────────────────────────────────────
  if (method === 'GET' && url === '/stats') {
    clientRes.writeHead(200, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify(stats));
    return;
  }

  // ── GET /v1/models ──────────────────────────────────────────────────────────
  if (method === 'GET' && (url === '/v1/models' || url.startsWith('/v1/models?'))) {
    clientRes.writeHead(200, { 'Content-Type': 'application/json' });
    clientRes.end(JSON.stringify({
      data: [
        { id: 'deepseek-v4-flash', display_name: 'DeepSeek V4 Flash', created: 1700000000 },
        { id: 'deepseek-v4-pro',   display_name: 'DeepSeek V4 Pro',   created: 1700000000 },
      ]
    }));
    return;
  }

  // ── HEAD/GET / ─────────────────────────────────────────────────────────────
  if ((method === 'HEAD' || method === 'GET') && (url === '/' || url === '')) {
    clientRes.writeHead(200, { 'Content-Type': 'text/plain' });
    clientRes.end('claude-proxy ok');
    return;
  }

  // ── Everything else: proxy to DeepSeek ─────────────────────────────────────
  stats.requests++;

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const upstreamPath = UPSTREAM_BASE + url;
    const headers = {
      'Content-Type':   req.headers['content-type']   || 'application/json',
      'Authorization':  `Bearer ${DEEPSEEK_KEY}`,
      'Accept':         req.headers['accept']          || 'application/json',
    };

    // Pass through relevant headers
    if (req.headers['anthropic-version']) headers['anthropic-version'] = req.headers['anthropic-version'];
    if (req.headers['anthropic-beta'])    headers['anthropic-beta']    = req.headers['anthropic-beta'];
    if (req.headers['x-api-key'])        headers['x-api-key']         = req.headers['x-api-key'];

    // Log request summary
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = {}; }
    const model      = parsed.model      ?? '?';
    const msgCount   = parsed.messages?.length ?? 0;
    const toolCount  = parsed.tools?.length    ?? 0;
    const isStream   = parsed.stream           ?? false;
    const maxTokens  = parsed.max_tokens       ?? '?';

    log(`[claude-proxy] → ${model} | stream:${isStream} | max_tokens:${maxTokens} | messages:${msgCount} | tools:${toolCount}`);

    const options = {
      hostname: UPSTREAM_HOST,
      port:     443,
      path:     upstreamPath,
      method,
      headers:  { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };

    const upstreamReq = https.request(options, upstreamRes => {
      const statusCode = upstreamRes.statusCode;

      if (statusCode >= 400) {
        stats.errors++;
        let errBody = '';
        upstreamRes.on('data', d => { errBody += d; });
        upstreamRes.on('end', () => {
          log(`[claude-proxy] ERROR ${statusCode}: ${errBody.slice(0, 300)}`);
          clientRes.writeHead(statusCode, upstreamRes.headers);
          clientRes.end(errBody);
        });
        return;
      }

      // Forward response headers
      clientRes.writeHead(statusCode, upstreamRes.headers);

      // For streaming, buffer chunks to extract token usage
      if (isStream) {
        let streamBuf = '';
        upstreamRes.on('data', chunk => {
          streamBuf += chunk.toString();
          clientRes.write(chunk);
          // Periodically parse for token usage (every ~4KB)
          if (streamBuf.length > 4096) {
            parseStreamTokens(streamBuf);
            streamBuf = streamBuf.slice(-2000); // keep tail for partial SSE events
          }
        });
        upstreamRes.on('end', () => {
          parseStreamTokens(streamBuf); // final parse
          log(`[claude-proxy] done | in:${stats.inputTokens} out:${stats.outputTokens} total:${stats.inputTokens + stats.outputTokens}`);
          clientRes.end();
        });
      } else {
        // Non-streaming — collect full response for token usage
        let resBody = '';
        upstreamRes.on('data', chunk => { resBody += chunk.toString(); clientRes.write(chunk); });
        upstreamRes.on('end', () => {
          try {
            const j = JSON.parse(resBody);
            if (j.usage?.input_tokens)  stats.inputTokens  += j.usage.input_tokens;
            if (j.usage?.output_tokens) stats.outputTokens += j.usage.output_tokens;
          } catch {}
          log(`[claude-proxy] done | in:${stats.inputTokens} out:${stats.outputTokens} total:${stats.inputTokens + stats.outputTokens}`);
          clientRes.end();
        });
      }
    });

    upstreamReq.on('error', err => {
      stats.errors++;
      log(`[claude-proxy] upstream error: ${err.message}`);
      try { clientRes.writeHead(502); } catch {}
      clientRes.end(JSON.stringify({ type: 'error', error: { message: err.message } }));
    });

    upstreamReq.write(body);
    upstreamReq.end();
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[claude-proxy] running on http://127.0.0.1:${PORT}`);
  console.log(`[claude-proxy] forwarding → ${UPSTREAM_HOST}${UPSTREAM_BASE}`);
  console.log(`[claude-proxy] debug mode: ${DEBUG ? 'ON' : 'OFF'}`);
  console.log(`[claude-proxy] stats:  http://127.0.0.1:${PORT}/stats`);
  console.log(`[claude-proxy] Press Ctrl+C for session summary`);
});
