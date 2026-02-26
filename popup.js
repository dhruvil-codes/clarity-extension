// ── STATE ──
let articleText = '';
let articleTitle = '';
let articleUrl   = '';
let currentData  = null;
let settings = {
  showTone: true,
  showEntities: true,
  showReadTime: true,
  apiKey: ''
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
  if (res.claritySettings) {
    settings = { ...settings, ...res.claritySettings };
    document.getElementById('api-key-input').value = settings.apiKey || '';
    document.getElementById('toggle-tone').checked = settings.showTone;
    document.getElementById('toggle-entities').checked = settings.showEntities;
    document.getElementById('toggle-readtime').checked = settings.showReadTime;
  }
});

// ── SETTINGS TOGGLE ──
document.getElementById('settings-toggle').addEventListener('click', () => {
  historyPanel.style.display = 'none';
  settingsPanel.style.display = settingsPanel.style.display === 'block' ? 'none' : 'block';
});

document.getElementById('save-settings').addEventListener('click', () => {
  settings.apiKey       = document.getElementById('api-key-input').value.trim();
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
  chrome.storage.local.set({ clarityHistory: [] }, () => {
    renderHistory();
  });
});

// ── SUMMARIZE ──
document.getElementById('summarize-btn').addEventListener('click', summarize);
document.getElementById('redo-btn').addEventListener('click', () => showState('idle'));

async function summarize() {
  hideError();
  showState('loading');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageText' });
    articleText  = response.text;
    articleTitle = response.title;
    articleUrl   = tab.url;

    const readTime = Math.ceil(articleText.split(' ').length / 200);
    const userPrompt = `Article title: ${articleTitle}\n\nArticle content:\n${articleText.slice(0, 8000)}`;

    const rawJson = await callAI(userPrompt);
    const cleaned = rawJson.trim().replace(/^```json|^```|```$/gm, '').trim();
    const data = JSON.parse(cleaned);
    currentData = data;

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

  // Tags row
  const tagsRow = document.getElementById('tags-row');
  tagsRow.innerHTML = '';
  const tags = data.tags || [];
  tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.textContent = tag.startsWith('#') ? tag : `#${tag}`;
    chip.addEventListener('click', () => searchEntity(tag.replace('#', '')));
    tagsRow.appendChild(chip);
  });

  // Meta badges
  const metaRow = document.getElementById('meta-row');
  const articleType = data.article_type || data.type || 'Article';
  const toneInfo    = data.tone || {};
  const tonePrimary = typeof toneInfo === 'string' ? toneInfo : (toneInfo.primary || '');
  const toneScore   = toneInfo.confidence_score;

  let badgesHTML = `<span class="badge badge-type">${typeIcon(articleType)} ${articleType}</span>`;

  if (settings.showTone && tonePrimary) {
    const scoreLabel = toneScore != null ? ` · ${toneScore}%` : '';
    badgesHTML += `<span class="badge badge-tone">◐ ${tonePrimary}${scoreLabel}</span>`;
  }

  if (settings.showEntities && data.entities) {
    const { people = [], companies = [], products = [] } = data.entities;
    people.slice(0, 2).forEach(p => {
      const name = p.name || p;
      badgesHTML += `<span class="badge badge-entity" title="${p.role_or_context || ''}">👤 ${name}</span>`;
    });
    companies.slice(0, 2).forEach(c => {
      const name = c.name || c;
      badgesHTML += `<span class="badge badge-entity badge-company" title="${c.industry_or_context || ''}">🏢 ${name}</span>`;
    });
    products.slice(0, 1).forEach(pr => {
      const name = pr.name || pr;
      badgesHTML += `<span class="badge badge-entity badge-product" title="${pr.context || ''}">📦 ${name}</span>`;
    });
  }

  metaRow.innerHTML = badgesHTML;
  metaRow.querySelectorAll('.badge-entity').forEach(badge => {
    badge.addEventListener('click', () => searchEntity(badge.textContent.slice(3).trim()));
  });

  // Key takeaways
  const pointsList = document.getElementById('points-list');
  pointsList.innerHTML = '';
  const points = data.key_takeaways || data.points || [];
  points.forEach((pt, i) => {
    const li = document.createElement('li');
    li.className = 'point-item';
    const numSpan = document.createElement('span');
    numSpan.className = 'point-num';
    numSpan.textContent = i < 9 ? `0${i+1}` : `${i+1}`;
    const textSpan = document.createElement('span');
    textSpan.textContent = pt;
    li.appendChild(numSpan);
    li.appendChild(textSpan);
    pointsList.appendChild(li);
    setTimeout(() => li.classList.add('visible'), i * 80 + 100);
  });

  if (settings.showReadTime && readTime) {
    document.getElementById('reading-time-label').textContent = `~${readTime} min read`;
  }
}

// ── SHARE CARD (Canvas) ──
document.getElementById('tldr-block').addEventListener('click', () => generateCard(false));
document.getElementById('download-btn').addEventListener('click', () => generateCard(true));
document.getElementById('share-x-btn').addEventListener('click', shareOnX);

function generateCard(download = false) {
  if (!currentData) return;

  const canvas = document.getElementById('share-canvas');
  const ctx    = canvas.getContext('2d');
  const W      = 800;
  const PAD    = 32;

  // ── Measure text height first to calculate dynamic canvas height ──
  canvas.width  = W;
  canvas.height = 600; // temp height for measuring

  ctx.font = '28px "Instrument Serif", Georgia, serif';
  const wrappedLines = wrapText(ctx, currentData.tldr || '', W - PAD * 2, 28);
  const textBlockH   = wrappedLines.length * 42;

  // Dynamic height: top bar (90) + eyebrow (50) + text + padding + bottom bar (80)
  const H = 90 + 50 + textBlockH + 20 + 80;
  canvas.width  = W;
  canvas.height = H;

  // ── Background ──
  ctx.fillStyle = '#0e0e0e';
  ctx.fillRect(0, 0, W, H);

  // Random gradient
  const gradients = [
    { x: W - 80, y: 80,     r: 200, color: '200,240,74'  }, // lime top-right
    { x: 80,     y: H - 80, r: 180, color: '74,200,140'  }, // teal bottom-left
    { x: W / 2,  y: 50,     r: 220, color: '120,80,240'  }, // purple top-center
    { x: W - 60, y: H - 60, r: 190, color: '240,160,74'  }, // amber bottom-right
    { x: 60,     y: 60,     r: 170, color: '74,160,240'  }, // blue top-left
  ];
  const g = gradients[Math.floor(Math.random() * gradients.length)];
  const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
  grad.addColorStop(0, `rgba(${g.color},0.22)`);
  grad.addColorStop(1, `rgba(${g.color},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── Logo mark ──
  ctx.fillStyle = '#1a4a1a';
  roundRect(ctx, PAD, 26, 36, 36, 9);
  ctx.fill();
  ctx.fillStyle = '#d4e8a0';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('C', PAD + 18, 51);

  // "Clarity" — Instrument Serif italic
  ctx.fillStyle = '#faf9f6';
  ctx.font = 'italic 600 22px "Instrument Serif", Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('Clarity', PAD + 46, 52);

  // Source domain top-right
  let domain = '';
  try { domain = new URL(articleUrl).hostname.replace('www.', ''); } catch(e) {}
  ctx.fillStyle = '#555';
  ctx.font = '13px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(domain, W - PAD, 50);

  // ── TL;DR eyebrow ──
  const eyebrowY = 90;
  ctx.fillStyle = '#c8f04a';
  ctx.font = '700 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('TL;DR', PAD, eyebrowY);

  // ── TLDR text ──
  ctx.font = '28px "Instrument Serif", Georgia, serif';
  ctx.fillStyle = '#f5f5f0';
  const textStartY = eyebrowY + 36;
  wrappedLines.forEach((line, i) => {
    ctx.fillText(line, PAD, textStartY + i * 42);
  });

  // ── Divider ──
  const dividerY = H - 64;
  ctx.strokeStyle = '#252525';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, dividerY);
  ctx.lineTo(W - PAD, dividerY);
  ctx.stroke();

  // ── Bottom bar ──
  const toneInfo    = currentData.tone || {};
  const tonePrimary = typeof toneInfo === 'string' ? toneInfo : (toneInfo.primary || '');
  const toneScore   = toneInfo.confidence_score;
  const articleType = currentData.article_type || currentData.type || '';

  ctx.fillStyle = '#666';
  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  let bottomLeft = '';
  if (tonePrimary) bottomLeft += `◐ ${tonePrimary}`;
  if (toneScore != null) bottomLeft += `  ·  ${toneScore}%`;
  if (articleType) bottomLeft += `   ${articleType}`;
  ctx.fillText(bottomLeft, PAD, dividerY + 28);

  // Branding bottom-right
  ctx.fillStyle = '#444';
  ctx.font = '12px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('Summarized with Clarity', W - PAD, dividerY + 28);

  if (download) {
    const link = document.createElement('a');
    link.download = 'clarity-summary.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  return canvas.toDataURL('image/png');
}

function shareOnX() {
  if (!currentData) return;

  // 1. Generate + auto-download the card
  generateCard(true);

  // 2. Show toast
  showToast('🖼 Card downloaded! Attach it to your tweet 👇');

  // 3. Open X with pre-filled tweet (short, clean)
  const tags  = (currentData.tags || []).slice(0, 3).map(t => t.startsWith('#') ? t : `#${t}`).join(' ');
  const tweet = `${currentData.tldr || ''}\n\n${tags}\n\nSummarized with Clarity 🧠`;
  setTimeout(() => {
    chrome.tabs.create({ url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}` });
  }, 800);
}

function showToast(msg) {
  const toast = document.getElementById('success-toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── ASK ──
document.getElementById('ask-btn').addEventListener('click', async () => {
  const question = document.getElementById('ask-input').value.trim();
  if (!question || !articleText) return;

  const askBtn  = document.getElementById('ask-btn');
  const askResp = document.getElementById('ask-response');
  askBtn.disabled = true;
  askBtn.textContent = '...';
  askResp.style.display = 'none';

  try {
    const answer = await callAI(
      `Article title: "${articleTitle}"\n\nArticle content:\n${articleText.slice(0, 6000)}\n\nUser question: ${question}`,
      `You are Clarity, a reading assistant. Answer the user's question based ONLY on the article provided. Be concise and direct. Do not invent information not present in the article.`
    );
    askResp.textContent = answer;
    askResp.style.display = 'block';
  } catch (err) {
    askResp.textContent = 'Could not get an answer. Try again.';
    askResp.style.display = 'block';
  }

  askBtn.disabled = false;
  askBtn.textContent = 'Ask';
});

// ── HISTORY ──
function saveToHistory(data) {
  chrome.storage.local.get(['clarityHistory'], (res) => {
    const history = res.clarityHistory || [];
    const entry = {
      title:        articleTitle,
      url:          articleUrl,
      tldr:         data.tldr,
      type:         data.article_type || data.type || '',
      tone:         data.tone || {},
      tags:         data.tags || [],
      key_takeaways: data.key_takeaways || [],
      entities:     data.entities || {},
      date:         Date.now()
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
      title.className = 'history-item-title';
      title.textContent = item.title || 'Untitled';

      const tldr = document.createElement('div');
      tldr.className = 'history-item-tldr';
      tldr.textContent = item.tldr || '';

      const meta = document.createElement('div');
      meta.className = 'history-item-meta';

      const date = document.createElement('span');
      date.className = 'history-item-date';
      date.textContent = formatDate(item.date);

      const type = document.createElement('span');
      type.className = 'history-item-date';
      type.textContent = item.type ? `${typeIcon(item.type)} ${item.type}` : '';

      meta.appendChild(date);
      meta.appendChild(type);

      div.appendChild(title);
      div.appendChild(tldr);
      div.appendChild(meta);

      // Click → load full summary in popup, don't open tab
      div.addEventListener('click', () => {
        // Restore state so share card works
        articleTitle = item.title;
        articleUrl   = item.url;
        currentData  = item;

        // Render result in popup
        renderResult(item, null);
        showState('result');
        historyPanel.style.display = 'none';

        // Hide reading time if not available from history
        document.getElementById('reading-time-label').textContent = '';

        // Add a subtle "← back" link in footer showing this is from history
        const redoBtn = document.getElementById('redo-btn');
        redoBtn.innerHTML = `
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Re-summarize`;

        // Show a small link to open original article
        document.getElementById('reading-time-label').innerHTML =
          `<a href="#" id="open-article-link" style="color:var(--muted);font-size:10px;text-decoration:none;font-family:'DM Mono',monospace;">↗ open article</a>`;
        setTimeout(() => {
          const link = document.getElementById('open-article-link');
          if (link) link.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: item.url });
          });
        }, 50);
      });

      listEl.appendChild(div);
    });
  });
}

function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 60000);
  if (diff < 1)   return 'just now';
  if (diff < 60)  return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff/60)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── AI CALL ──
async function callAI(userPrompt, systemOverride = null) {
  const apiKey = settings.apiKey;
  if (!apiKey) throw new Error('No API key set. Open settings (⚙) to add your OpenAI API key.');

  const systemPrompt = systemOverride || `You are Clarity, an elite reading assistant embedded inside a Chrome extension.
Your task is to analyze the provided webpage article content and return a structured JSON response.
Follow these rules strictly:
1. Do NOT add commentary outside JSON.
2. Do NOT include markdown or code fences.
3. Do NOT invent information.
4. Only use information present in the provided text.
5. Be concise, precise, and neutral.
6. Output must be valid JSON.

Return the result in the following structure:
{
  "tldr": "One sharp, highly condensed sentence (max 25 words) capturing the core message.",
  "key_takeaways": [
    "Bullet point 1 (clear and specific)",
    "Bullet point 2",
    "Bullet point 3",
    "Bullet point 4",
    "Bullet point 5"
  ],
  "article_type": "News | Opinion | Research | Blog | Tutorial | Interview | Report | Review | Analysis | Other",
  "tone": {
    "primary": "Neutral | Critical | Optimistic | Pessimistic | Informative | Persuasive | Analytical | Emotional",
    "confidence_score": 0
  },
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "entities": {
    "people": [{ "name": "Full Name", "role_or_context": "Short description of who they are in this article" }],
    "companies": [{ "name": "Company Name", "industry_or_context": "Short description based only on article" }],
    "products": [{ "name": "Product Name", "context": "Short description based only on article" }]
  }
}
For tags: extract 4-6 short, relevant topic keywords from the article (e.g. "AI", "India", "OpenAI"). No hashtag symbol needed.
If an entity category has no entries, return an empty array.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt }
      ]
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `API Error ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
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

function typeIcon(type) {
  const icons = { News:'📰', Opinion:'💬', Research:'🔬', Tutorial:'📖', Analysis:'📊', Marketing:'📣', Interview:'🎙', Blog:'✍️', Report:'📋', Review:'⭐', Other:'📄' };
  return icons[type] || '📄';
}

function searchEntity(name) {
  chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(name)}` });
}

function wrapText(ctx, text, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
