// blog.kirakira.cloud — Post viewer
// Loads a single post by slug and renders markdown

(function () {
  'use strict';

  // --- Nav scroll ---
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  // --- Load post ---
  async function loadPost() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');

    if (!slug) {
      showError('No post specified');
      return;
    }

    try {
      // Load post data
      const resp = await fetch(`posts/${encodeURIComponent(slug)}.json`);
      if (!resp.ok) throw new Error('Post not found');
      const post = await resp.json();

      renderPost(post);
    } catch (e) {
      showError('Post not found');
    }
  }

  function renderPost(post) {
    // Update page title
    document.title = `${post.title} — blog.kirakira.cloud`;

    // Update meta
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = post.excerpt || '';

    // Render header
    const titleEl = document.getElementById('post-title');
    const metaEl = document.getElementById('post-meta');

    titleEl.textContent = post.title;

    const date = formatDate(post.date);
    const readingTime = estimateReadingTime(post.content || '');

    let tagsHtml = '';
    if (post.tags && post.tags.length) {
      tagsHtml = `
        <div class="post-page__tags">
          ${post.tags.map(t => `<span class="post-page__tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      `;
    }

    metaEl.innerHTML = `
      <span class="post-page__meta-date">${date}</span>
      <span class="post-card__dot"></span>
      <span class="post-page__meta-reading">${readingTime}</span>
      ${tagsHtml}
    `;

    // Render content
    const contentEl = document.getElementById('post-content');
    if (typeof marked !== 'undefined') {
      marked.setOptions({
        gfm: true,
        breaks: true
      });
      contentEl.innerHTML = marked.parse(post.content || '');
    } else {
      // Fallback: render as plain text with basic formatting
      contentEl.innerHTML = `<p>${escapeHtml(post.content || '')}</p>`;
    }
  }

  function showError(msg) {
    document.getElementById('post-title').textContent = msg;
    document.getElementById('post-meta').innerHTML = '';
    document.getElementById('post-content').innerHTML = `
      <div class="empty-state" style="display: block; animation: fadeIn 0.5s ease-out forwards;">
        <div class="empty-state__icon">404</div>
        <p class="empty-state__text">${escapeHtml(msg)}</p>
        <a href="/" style="display: inline-block; margin-top: 16px; font-family: var(--font-mono); font-size: 0.85rem;">&larr; back to posts</a>
      </div>
    `;
  }

  // --- Helpers ---
  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function estimateReadingTime(text) {
    const words = text.split(/\s+/).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return `${mins} min read`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', loadPost);
})();
