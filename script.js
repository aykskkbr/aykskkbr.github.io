const PROXY_BASE = 'https://ayaka-scrapbox.santanaruse.workers.dev';
const PROJECT_NAME = 'ayakasakakibara';

let allPages = [];

// インデックス等に表示したくないページタイトル
// 念のため元の除外リストも残しつつ、artwork以外のタグページ等が紛れ込まないようにします
const EXCLUDED_TITLES = ['artwork', 'About'];

/**
 * Scrapbox記法をHTMLに変換する
 */
function scrapboxToHtml(text) {
  const lines = text.split('\n');
  const title = lines.shift();
  let html = `<h1>${title}</h1>`;

  let inCodeBlock = false;
  let codeIndentLevel = 0;

  lines.forEach(line => {
    const codeMatch = line.match(/^(\s*)code:(.+)$/);
    if (!inCodeBlock && codeMatch) {
      inCodeBlock = true;
      codeIndentLevel = codeMatch[1].length;
      const fileName = codeMatch[2].trim();
      html += `<div class="code-title" style="margin-left:${codeIndentLevel * 20}px">${fileName}</div>`;
      html += `<pre class="code-block" style="margin-left:${codeIndentLevel * 20}px"><code>`;
      return;
    }

    if (inCodeBlock) {
      const currentIndentMatch = line.match(/^(\s*)(.*)/);
      const currentIndentLevel = currentIndentMatch[1].length;
      const content = currentIndentMatch[2];
      if (line.trim() !== '' && currentIndentLevel <= codeIndentLevel) {
        html += '</code></pre>';
        inCodeBlock = false;
      } else {
        if (line.trim() === '') {
          html += '\n';
        } else {
          const preservedIndent = currentIndentMatch[1].substring(codeIndentLevel + 1);
          const safeContent = content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          html += preservedIndent + safeContent + '\n';
        }
        return;
      }
    }

    if (!line.trim()) { html += '<br>'; return; }
    line = line.replace(/^\[\* (.+?)\]/g, '<h2>$1</h2>');
    line = line.replace(/\[(https?:\/\/scrapbox\.io\/files\/[^\]]+)\]/g, (match, url) => {
      const proxiedUrl = url.replace('https://scrapbox.io', PROXY_BASE);
      return `<img src="${proxiedUrl}" alt="image">`;
    });
    line = line.replace(/\[(https?:\/\/[^\]]+\.(?:png|jpg|jpeg|gif|svg|webp))\]/g, '<img src="$1">');
    line = line.replace(/\[https?:\/\/(?:www\.youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)\]/g,
      '<div class="video-container"><iframe src="https://www.youtube.com/embed/$1" frameborder="0" allowfullscreen></iframe></div>');
    line = line.replace(/\[https?:\/\/vimeo\.com\/([0-9]+)\]/g,
      '<div class="video-container"><iframe src="https://player.vimeo.com/video/$1" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>');
    line = line.replace(/\[([^\]]+)\]/g, (match, content) => {
      const urlMatch = content.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        const url = urlMatch[1];
        const label = content.replace(url, '').trim();
        return `<a href="${url}" target="_blank" class="external-link">${label || url}</a>`;
      }
      if (content.endsWith('.icon')) {
        const iconName = content.replace('.icon', '');
        return `<img src="${PROXY_BASE}/api/pages/${PROJECT_NAME}/${encodeURIComponent(iconName)}/icon" class="scrapbox-icon">`;
      }
      return `<a href="viewer.html?page=${encodeURIComponent(content)}" class="scrapbox-tag">${content}</a>`;
    });
    const indentMatch = line.match(/^(\s+)(.*)/);
    if (indentMatch) {
      const level = indentMatch[1].length;
      html += `<div class="indent" style="margin-left:${level * 20}px">${indentMatch[2]}</div>`;
    } else if (!line.startsWith('<h2')) {
      html += `<p>${line}</p>`;
    } else {
      html += line;
    }
  });
  if (inCodeBlock) { html += '</code></pre>'; }
  return html;
}

/**
 * データ取得・表示ロジック
 */
async function fetchScrapboxData(pageType, currentPageTitle = null, foundTags = []) {
  try {
    const response = await fetch(`${PROXY_BASE}/api/pages/${PROJECT_NAME}?limit=100`);
    const data = await response.json();
    allPages = data.pages;

    if (pageType === 'works') {
      displayWorks('all'); // Works一覧表示
    } else if (pageType === 'related') {
      displayRelatedLinks(currentPageTitle, foundTags);
    }
  } catch (err) {
    console.error(err);
  }
}

// --- Works (Index) 専用 ---
function displayWorks(filterTag) {
  const container = document.getElementById('works-grid');
  if (!container) return;

  const filtered = allPages.filter(page => {
    if (EXCLUDED_TITLES.includes(page.title.toLowerCase())) return false;
    const desc = page.descriptions.join(' ').toLowerCase();

    // [artwork] タグがあるページのみ抽出
    return desc.includes('[artwork]');
  });

  renderGrid(filtered, container);
}

// script.js 内の renderGrid 関数をこれに置き換えてください

function renderGrid(pages, container) {
  container.innerHTML = '';
  // ホバープレビュー用の要素取得は不要になったため削除

  if (pages.length === 0) {
    container.innerHTML = '<p class="loading">No works found.</p>';
    return;
  }

  pages.forEach(page => {
    const card = document.createElement('div');
    card.className = 'work-card'; // クラス名を変更

    let imgUrl = page.image || '';
    if (imgUrl.startsWith('https://scrapbox.io')) {
      imgUrl = imgUrl.replace('https://scrapbox.io', PROXY_BASE);
    }

    // 画像がない場合のプレースホルダー画像（必要に応じて変更可）
    const imageStyle = imgUrl
      ? `background-image: url('${imgUrl}');`
      : 'background-color: #f0f0f0;';

    card.innerHTML = `
      <a href="viewer.html?page=${encodeURIComponent(page.title)}" class="card-link">
        <div class="card-image" style="${imageStyle}"></div>
        <div class="card-info">
          <h3>${page.title}</h3>
        </div>
      </a>
    `;

    container.appendChild(card);
  });
}

async function fetchAboutContent() {
  const container = document.getElementById('about-content');
  try {
    const response = await fetch(`${PROXY_BASE}/api/pages/${PROJECT_NAME}/About/text`);
    const text = await response.text();
    const bodyText = text.split('\n').slice(1).join('\n');
    container.innerHTML = scrapboxToHtml(bodyText);
  } catch (err) {
    container.innerHTML = 'About content not found.';
  }
}
