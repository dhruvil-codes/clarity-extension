# Clarity — AI Reading Assistant for Chrome

Stop copy-pasting articles into ChatGPT.  
Clarity summarizes any article in 1 click, right from your browser toolbar.

---

## How it works

1. Open any article — TechCrunch, Medium, Substack, anywhere
2. Click the **Clarity** icon in your toolbar
3. Hit **Summarize this article**

You instantly get:
- **TL;DR** — one sentence summary
- **5 Key Takeaways** — clean, numbered breakdown
- **Tone & Type** — e.g. Informative · 91% · News
- **Topic Tags** — auto-extracted keywords
- **Entities** — key people & companies, click to search
- **Ask Follow-ups** — ask anything about the article
- **Share Card** — download a card or share straight to X
- **History** — last 15 summaries, viewable in the popup

---

## Setup

1. Clone this repo
2. Go to `chrome://extensions` → Enable **Developer Mode** → **Load Unpacked** → select the folder
3. Click the Clarity icon → ⚙ → paste your [OpenAI API key](https://platform.openai.com) → Save

> Cost: ~$0.0003 per summary. $5 of credits lasts years at casual use.

---

## Stack

Chrome Manifest V3 · GPT-4o Mini · HTML5 Canvas · Javascript

---

## Privacy

Your API key is stored locally and only ever sent directly to OpenAI. Nothing is collected or logged by this extension.

---

Built by [@bydhruvil](https://twitter.com/bydhruvil)