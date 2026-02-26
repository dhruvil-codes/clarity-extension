// content.js — Runs inside the webpage to extract article text

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageText') {
    const text = extractArticleText();
    const title = document.title;
    sendResponse({ text, title });
  }
  return true; // Keep the message channel open for async
});

function extractArticleText() {
  // Priority selectors — try to get the real article content
  const selectors = [
    'article',
    '[role="main"]',
    '.post-content',
    '.article-body',
    '.article-content',
    '.entry-content',
    '.story-body',
    '.post-body',
    '.content-body',
    'main',
  ];

  let el = null;
  for (const sel of selectors) {
    el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 200) break;
  }

  const raw = el ? el.innerText : document.body.innerText;

  // Clean up: remove excessive whitespace
  return raw
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 10000); // Cap at ~10k chars to stay within token limits
}
