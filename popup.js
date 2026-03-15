// ── PROVIDER CONFIG ──
const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini (recommended)' },
      { id: 'gpt-4o',      label: 'GPT-4o (best quality)' },
    ],
    keyPlaceholder: 'sk-proj-...',
    buildRequest(key, model, sys, user) {
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: { model, max_tokens: 1200, messages: [{ role:'system', content: sys }, { role:'user', content: user }] }
      };
    },
    parseResponse: d => d.choices[0].message.content
  },
  claude: {
    name: 'Claude (Anthropic)',
    defaultModel: 'claude-haiku-4-5-20251001',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku (recommended)' },
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet (best quality)' },
    ],
    keyPlaceholder: 'sk-ant-api03-...',
    buildRequest(key, model, sys, user) {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: { model, max_tokens: 1200, system: sys, messages: [{ role:'user', content: user }] }
      };
    },
    parseResponse: d => d.content[0].text
  },
  gemini: {
    name: 'Gemini (Google)',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash',        label: 'Gemini 2.5 Flash (recommended)' },
      { id: 'gemini-2.5-pro',          label: 'Gemini 2.5 Pro (best quality)' },
      { id: 'gemini-2.5-flash-lite',   label: 'Gemini 2.5 Flash-Lite (fastest)' },
      { id: 'gemini-2.0-flash',        label: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.0-flash-lite',   label: 'Gemini 2.0 Flash-Lite' },
      { id: 'gemini-flash-latest',     label: 'Gemini Flash Latest' },
      { id: 'gemini-pro-latest',       label: 'Gemini Pro Latest' },
      { id: 'gemma-3-27b-it',          label: 'Gemma 3 27B' },
      { id: 'gemma-3-12b-it',          label: 'Gemma 3 12B' },
      { id: 'gemma-3-4b-it',           label: 'Gemma 3 4B' },
    ],
    keyPlaceholder: 'AIza...',
    buildRequest(key, model, sys, user) {
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        headers: { 'Content-Type': 'application/json' },
        body: { contents: [{ parts: [{ text: `${sys}\n\n${user}` }] }] }
      };
    },
    parseResponse: d => d.candidates[0].content.parts[0].text
  }
};

// ── STATE ──
let articleText  = '';
let articleTitle = '';
let articleUrl   = '';
let currentData  = null;
let settings = {
  showTone: true, showEntities: true, showReadTime: true,
  provider: 'openai', model: 'gpt-4o-mini', apiKey: ''
};

// ── DOM refs ──
const idleState    = document.getElementById('idle-state');
const loadingState = document.getElementById('loading-state');
const resultState  = document.getElementById('result-state');
const errorToast   = document.getElementById('error-toast');
const settingsPanel= document.getElementById('settings-panel');
const historyPanel = document.getElementById('history-panel');

// ── LOAD SETTINGS ──
chrome.storage.sync.get(['claritySettings'], (res) => {
  if (res.claritySettings) settings = { ...settings, ...res.claritySettings };
  populateSettingsUI();
});

async function populateSettingsUI() {
  const providerSel = document.getElementById('provider-select');
  providerSel.value = settings.provider || 'openai';
  updateKeyPlaceholder(settings.provider);
  updateFreeDisclaimer(settings.model);
  document.getElementById('api-key-input').value      = settings.apiKey || '';
  document.getElementById('toggle-tone').checked      = settings.showTone;
  document.getElementById('toggle-entities').checked  = settings.showEntities;
  document.getElementById('toggle-readtime').checked  = settings.showReadTime;
  rebuildModelDropdown(settings.provider, settings.model);
}

// ── PROVIDER / MODEL DROPDOWNS ──
document.getElementById('provider-select').addEventListener('change', e => {
  const p = e.target.value;
  settings.provider = p;
  settings.model    = PROVIDERS[p].defaultModel;
  updateKeyPlaceholder(p);
  updateFreeDisclaimer(settings.model);
  rebuildModelDropdown(p, settings.model);
});

document.getElementById('model-select').addEventListener('change', e => {
  settings.model = e.target.value;
  updateFreeDisclaimer(settings.model);
});

function rebuildModelDropdown(provider, selectedModel) {
  const sel = document.getElementById('model-select');
  sel.innerHTML = '';
  (PROVIDERS[provider]?.models || []).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.label;
    if (m.id === selectedModel) opt.selected = true;
    sel.appendChild(opt);
  });
  if (!sel.value && sel.options.length > 0) sel.selectedIndex = 0;
}

function updateKeyPlaceholder(provider) {
  document.getElementById('api-key-input').placeholder = PROVIDERS[provider]?.keyPlaceholder || 'API Key...';
}

function updateFreeDisclaimer(model) {
  const show = model && model.includes(':free');
  document.getElementById('free-disclaimer').style.display = show ? 'flex' : 'none';
}

// ── SETTINGS PANEL TOGGLE ──
document.getElementById('settings-toggle').addEventListener('click', () => {
  historyPanel.style.display = 'none';
  settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
});

document.getElementById('save-settings').addEventListener('click', () => {
  settings.apiKey       = document.getElementById('api-key-input').value.trim();
  settings.provider     = document.getElementById('provider-select').value;
  settings.model        = document.getElementById('model-select').value;
  settings.showTone     = document.getElementById('toggle-tone').checked;
  settings.showEntities = document.getElementById('toggle-entities').checked;
  settings.showReadTime = document.getElementById('toggle-readtime').checked;
  chrome.storage.sync.set({ claritySettings: settings }, () => {
    const btn = document.getElementById('save-settings');
    btn.textContent = 'Saved ✓';
    setTimeout(() => { btn.textContent = 'Save Settings'; }, 1500);
    settingsPanel.style.display = 'none';
  });
});

// ── HISTORY TOGGLE ──
document.getElementById('history-toggle').addEventListener('click', () => {
  settingsPanel.style.display = 'none';
  const isOpen = historyPanel.style.display === 'block';
  historyPanel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) renderHistory();
});

document.getElementById('history-clear').addEventListener('click', () => {
  chrome.storage.local.set({ clarityHistory: [] }, () => renderHistory());
});

// ── SUMMARIZE ──
document.getElementById('summarize-btn').addEventListener('click', summarize);
document.getElementById('redo-btn').addEventListener('click', () => showState('idle'));

async function summarize() {
  hideError();
  showState('loading');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject content.js if not already present
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    } catch(e) { /* already injected — ignore */ }

    const resp   = await chrome.tabs.sendMessage(tab.id, { action: 'getPageText' });
    articleText  = resp.text;
    articleTitle = resp.title;
    articleUrl   = tab.url;

    const readTime   = Math.ceil(articleText.split(' ').length / 200);
    const userPrompt = `Article title: ${articleTitle}\n\nArticle content:\n${articleText.slice(0, 8000)}`;
    const rawJson    = await callAI(userPrompt);
    // Robust JSON extraction — handles markdown fences, extra text, trailing commas
    let cleaned = rawJson.trim();
    // Strip markdown code fences
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/,'').trim();
    // Extract just the JSON object if there's surrounding text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace  = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    // Fix trailing commas before } or ] (common model mistake)
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    const data = JSON.parse(cleaned);
    currentData      = data;

    renderResult(data, readTime);
    saveToHistory(data);
    showState('result');
  } catch (err) {
    showState('idle');
    showError(err.message || 'Failed to summarize. Check your API key in settings.');
  }
}

// ── RENDER RESULT ──
function renderResult(data, readTime) {
  document.getElementById('tldr-text').textContent = data.tldr;

  const tagsRow = document.getElementById('tags-row');
  tagsRow.innerHTML = '';
  // tags row hidden — keeping only badges below

  const metaRow     = document.getElementById('meta-row');
  const articleType = data.article_type || data.type || 'Article';
  const toneInfo    = data.tone || {};
  const tonePrimary = typeof toneInfo === 'string' ? toneInfo : (toneInfo.primary || '');
  const toneScore   = toneInfo.confidence_score;

  let badgesHTML = `<span class="badge badge-type">${typeIcon(articleType)} ${articleType}</span>`;
  if (settings.showTone && tonePrimary) {
    badgesHTML += `<span class="badge badge-tone">◐ ${tonePrimary}${toneScore != null ? ` · ${toneScore}%` : ''}</span>`;
  }
  if (settings.showEntities && data.entities) {
    const { people=[], companies=[], products=[] } = data.entities;
    people.slice(0,2).forEach(p => {
      badgesHTML += `<span class="badge badge-entity" title="${p.role_or_context||''}">👤 ${p.name||p}</span>`;
    });
    companies.slice(0,2).forEach(c => {
      badgesHTML += `<span class="badge badge-entity badge-company" title="${c.industry_or_context||''}">🏢 ${c.name||c}</span>`;
    });
    products.slice(0,1).forEach(pr => {
      badgesHTML += `<span class="badge badge-entity badge-product" title="${pr.context||''}">📦 ${pr.name||pr}</span>`;
    });
  }
  metaRow.innerHTML = badgesHTML;
  metaRow.querySelectorAll('.badge-entity').forEach(b => {
    b.addEventListener('click', () => searchEntity(b.textContent.slice(3).trim()));
  });

  const pointsList = document.getElementById('points-list');
  pointsList.innerHTML = '';
  (data.key_takeaways || data.points || []).forEach((pt, i) => {
    const li  = document.createElement('li');
    li.className = 'point-item';
    const num = document.createElement('span');
    num.className = 'point-num';
    num.textContent = i < 9 ? `0${i+1}` : `${i+1}`;
    const txt = document.createElement('span');
    txt.textContent = pt;
    li.appendChild(num); li.appendChild(txt);
    pointsList.appendChild(li);
    setTimeout(() => li.classList.add('visible'), i * 80 + 100);
  });

  if (settings.showReadTime && readTime) {
    document.getElementById('reading-time-label').textContent = `~${readTime} min read`;
  }
}

// ── SHARE CARD ──
document.getElementById('tldr-block').addEventListener('click', async () => generateCard(false));
document.getElementById('download-btn').addEventListener('click', async () => generateCard(true));
document.getElementById('share-x-btn').addEventListener('click', shareOnX);

async function generateCard(download = false) {
  if (!currentData) return;

  // Load Instrument Serif italic via CSS API (most reliable URL)
  if (!document.fonts.check('italic 24px "Instrument Serif"')) {
    try {
      const font = new FontFace(
        'Instrument Serif',
        `url(https://fonts.gstatic.com/s/instrumentserif/v1/Qw3TZQpMCyTtJSvBtNoorS1XkU_x2g.woff2)`,
        { style: 'italic', weight: '400' }
      );
      const loaded = await font.load();
      document.fonts.add(loaded);
    } catch(e) { /* fallback */ }
  }
  await document.fonts.ready;

  const canvas = document.getElementById('share-canvas');
  const ctx    = canvas.getContext('2d');
  const W = 800, PAD = 32;

  // Measure wrapped lines first
  canvas.width = W; canvas.height = 600;
  ctx.font = '28px "Instrument Serif", Georgia, serif';
  const lines      = wrapText(ctx, currentData.tldr || '', W - PAD * 2);
  const textBlockH = lines.length * 42;

  // Tight height: topbar(72) + gap(16) + eyebrow(20) + text + gap(16) + divider(1) + footer(44)
  const H = 72 + 16 + 20 + textBlockH + 16 + 1 + 44;
  canvas.width = W; canvas.height = H;

  // Background
  ctx.fillStyle = '#0e0e0e'; ctx.fillRect(0, 0, W, H);
  const gradients = [
    { x: W-80, y:80,    r:200, c:'200,240,74'  },
    { x: 80,   y:H-80,  r:180, c:'74,200,140'  },
    { x: W/2,  y:50,    r:220, c:'120,80,240'  },
    { x: W-60, y:H-60,  r:190, c:'240,160,74'  },
    { x: 60,   y:60,    r:170, c:'74,160,240'  },
  ];
  const g    = gradients[Math.floor(Math.random() * gradients.length)];
  const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
  grad.addColorStop(0, `rgba(${g.c},0.22)`); grad.addColorStop(1, `rgba(${g.c},0)`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  // Logo mark box
  ctx.fillStyle = '#1a4a1a';
  roundRect(ctx, PAD, 18, 36, 36, 9); ctx.fill();

  // "C" inside box — same font as wordmark
  ctx.fillStyle = '#d4e8a0';
  ctx.font = 'italic 24px "Instrument Serif", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('C', PAD + 18, 44);

  // "Clarity" wordmark
  ctx.fillStyle = '#faf9f6';
  ctx.font = 'italic 24px "Instrument Serif", Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('Clarity', PAD + 46, 44);

  // Domain top-right
  let domain = ''; try { domain = new URL(articleUrl).hostname.replace('www.',''); } catch(e) {}
  ctx.fillStyle = '#555'; ctx.font = '13px monospace'; ctx.textAlign = 'right';
  ctx.fillText(domain, W - PAD, 42);

  // TL;DR eyebrow
  const eyebrowY = 72 + 16 + 14;
  ctx.fillStyle = '#c8f04a'; ctx.font = '700 11px monospace'; ctx.textAlign = 'left';
  ctx.fillText('TL;DR', PAD, eyebrowY);

  // TLDR text — tight right under eyebrow
  const textY = eyebrowY + 30;
  ctx.font = '28px "Instrument Serif", Georgia, serif'; ctx.fillStyle = '#f5f5f0';
  lines.forEach((line, i) => ctx.fillText(line, PAD, textY + i * 42));

  // Divider — sits exactly at end of text + 16px gap
  const divY = textY + textBlockH - 12 + 16;
  ctx.strokeStyle = '#252525'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, divY); ctx.lineTo(W - PAD, divY); ctx.stroke();

  // Footer
  const footerY = divY + 28;
  const toneInfo    = currentData.tone || {};
  const tonePrimary = typeof toneInfo === 'string' ? toneInfo : (toneInfo.primary || '');
  const toneScore   = toneInfo.confidence_score;
  const articleType = currentData.article_type || currentData.type || '';
  ctx.fillStyle = '#666'; ctx.font = '13px monospace'; ctx.textAlign = 'left';
  let bl = '';
  if (tonePrimary) bl += `◐ ${tonePrimary}`;
  if (toneScore != null) bl += `  ·  ${toneScore}%`;
  if (articleType) bl += `   ${articleType}`;
  ctx.fillText(bl, PAD, footerY);
  ctx.fillStyle = '#444'; ctx.font = '12px monospace'; ctx.textAlign = 'right';
  ctx.fillText('Summarized with Clarity', W - PAD, footerY);

  if (download) {
    const a = document.createElement('a');
    a.download = 'clarity-summary.png'; a.href = canvas.toDataURL('image/png'); a.click();
  }
  return canvas.toDataURL('image/png');
}

async function shareOnX() {
  if (!currentData) return;

  const dataUrl = await generateCard(false); // render only, no download

  try {
    // Convert canvas dataURL to blob and copy to clipboard
    const res   = await fetch(dataUrl);
    const blob  = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': blob })
    ]);
    showToast('🖼 Image copied! Open X and paste it (Ctrl+V)');
  } catch(e) {
    // Clipboard API failed — fall back to download
    generateCard(true);
    showToast('🖼 Card downloaded! Attach it to your tweet manually');
  }

  // Open blank X compose
  setTimeout(() => chrome.tabs.create({ url: 'https://twitter.com/intent/tweet' }), 600);
}

// ── ASK ──
document.getElementById('ask-btn').addEventListener('click', async () => {
  const question = document.getElementById('ask-input').value.trim();
  if (!question || !articleText) return;
  const askBtn  = document.getElementById('ask-btn');
  const askResp = document.getElementById('ask-response');
  askBtn.disabled = true; askBtn.textContent = '...'; askResp.style.display = 'none';
  try {
    const answer = await callAI(
      `Article title: "${articleTitle}"\n\nArticle content:\n${articleText.slice(0,6000)}\n\nUser question: ${question}`,
      `You are Clarity, a reading assistant. Answer the user's question based ONLY on the article provided. Be concise and direct.`
    );
    askResp.textContent = answer; askResp.style.display = 'block';
  } catch(err) {
    askResp.textContent = 'Could not get an answer. Try again.'; askResp.style.display = 'block';
  }
  askBtn.disabled = false; askBtn.textContent = 'Ask';
});

// ── HISTORY ──
function saveToHistory(data) {
  chrome.storage.local.get(['clarityHistory'], (res) => {
    const history = res.clarityHistory || [];
    const entry = {
      title: articleTitle, url: articleUrl, tldr: data.tldr,
      type: data.article_type || data.type || '', tone: data.tone || {},
      tags: data.tags || [], key_takeaways: data.key_takeaways || [],
      entities: data.entities || {}, date: Date.now()
    };
    const filtered = history.filter(h => h.url !== articleUrl);
    filtered.unshift(entry);
    chrome.storage.local.set({ clarityHistory: filtered.slice(0, 15) });
  });
}

function renderHistory() {
  const listEl = document.getElementById('history-list');
  chrome.storage.local.get(['clarityHistory'], (res) => {
    const history = res.clarityHistory || [];
    if (history.length === 0) {
      listEl.innerHTML = '<div class="history-empty">No summaries yet.<br/>Summarize an article to see it here.</div>';
      return;
    }
    listEl.innerHTML = '';
    history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      const title = document.createElement('div');
      title.className = 'history-item-title'; title.textContent = item.title || 'Untitled';
      const tldr = document.createElement('div');
      tldr.className = 'history-item-tldr'; tldr.textContent = item.tldr || '';
      const meta = document.createElement('div');
      meta.className = 'history-item-meta';
      const date = document.createElement('span');
      date.className = 'history-item-date'; date.textContent = formatDate(item.date);
      const type = document.createElement('span');
      type.className = 'history-item-date';
      type.textContent = item.type ? `${typeIcon(item.type)} ${item.type}` : '';
      meta.appendChild(date); meta.appendChild(type);
      div.appendChild(title); div.appendChild(tldr); div.appendChild(meta);
      div.addEventListener('click', () => {
        articleTitle = item.title; articleUrl = item.url; currentData = item;
        renderResult(item, null); showState('result');
        historyPanel.style.display = 'none';
        document.getElementById('reading-time-label').innerHTML =
          `<a href="#" id="open-article-link" style="color:var(--muted);font-size:10px;text-decoration:none;font-family:'DM Mono',monospace;">↗ open article</a>`;
        setTimeout(() => {
          const link = document.getElementById('open-article-link');
          if (link) link.addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url: item.url }); });
        }, 50);
      });
      listEl.appendChild(div);
    });
  });
}

function formatDate(ts) {
  const d = new Date(ts), now = new Date();
  const diff = Math.floor((now - d) / 60000);
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

// ── AI CALL — MULTI-PROVIDER ──
async function callAI(userPrompt, systemOverride = null) {
  const provider = settings.provider || 'openai';
  const model    = settings.model    || PROVIDERS[provider].defaultModel;
  const apiKey   = settings.apiKey;

  if (!apiKey) throw new Error(`No API key. Open settings ⚙ and add your ${PROVIDERS[provider].name} key.`);

  const systemPrompt = systemOverride || `You are Clarity, an elite reading assistant embedded inside a Chrome extension.
Your task is to analyze the provided webpage article content and return a structured JSON response.
Follow these rules strictly:
1. Do NOT add commentary outside JSON.
2. Do NOT include markdown or code fences.
3. Do NOT invent information not in the article.
4. Be concise, precise, and neutral.
5. Output must be valid JSON only.

Return exactly this JSON structure:
{
  "tldr": "One sharp, condensed sentence (max 25 words) capturing the core message.",
  "key_takeaways": ["point 1","point 2","point 3","point 4","point 5"],
  "article_type": "News | Opinion | Research | Blog | Tutorial | Interview | Report | Review | Analysis | Other",
  "tone": { "primary": "Neutral | Critical | Optimistic | Pessimistic | Informative | Persuasive | Analytical | Emotional", "confidence_score": 0 },
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "entities": {
    "people":    [{ "name": "Full Name", "role_or_context": "who they are" }],
    "companies": [{ "name": "Company",   "industry_or_context": "context" }],
    "products":  [{ "name": "Product",   "context": "context" }]
  }
}
Tags: 4-6 short topic keywords, no hashtag symbol. Empty array if no entities.`;

  const p   = PROVIDERS[provider];
  const req = p.buildRequest(apiKey, model, systemPrompt, userPrompt);
  const res = await fetch(req.url, { method:'POST', headers: req.headers, body: JSON.stringify(req.body) });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || err.message || `API Error ${res.status}`);
  }

  return p.parseResponse(await res.json());
}

// ── UTILS ──
function showState(state) {
  idleState.style.display    = state === 'idle'    ? 'block' : 'none';
  loadingState.style.display = state === 'loading' ? 'block' : 'none';
  resultState.style.display  = state === 'result'  ? 'block' : 'none';
}
function showError(msg) {
  document.getElementById('error-msg').textContent = msg;
  errorToast.style.display = 'flex';
}
function hideError() { errorToast.style.display = 'none'; }
function showToast(msg) {
  const t = document.getElementById('success-toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}
function typeIcon(type) {
  const icons = { News:'📰', Opinion:'💬', Research:'🔬', Tutorial:'📖', Analysis:'📊', Marketing:'📣', Interview:'🎙', Blog:'✍️', Report:'📋', Review:'⭐', Other:'📄' };
  return icons[type] || '📄';
}
function searchEntity(name) {
  chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(name)}` });
}
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}
