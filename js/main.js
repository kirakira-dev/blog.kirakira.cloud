// blog.kirakira.cloud — Main JS
// Handles: post listing, scroll animations, nav behavior

(function () {
  'use strict';

  // --- Nav scroll effect ---
  const nav = document.getElementById('nav');
  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (scrollY > 20) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
    lastScroll = scrollY;
  }, { passive: true });

  // --- Scroll reveal ---
  function initScrollReveal() {
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    reveals.forEach((el) => observer.observe(el));
  }

  // --- Load posts ---
  async function loadPosts() {
    const grid = document.getElementById('posts-grid');
    const emptyState = document.getElementById('empty-state');
    if (!grid) return;

    try {
      const resp = await fetch('posts/_index.json');
      if (!resp.ok) throw new Error('No posts index');
      const posts = await resp.json();

      if (!posts.length) {
        emptyState.style.display = 'block';
        return;
      }

      // Sort by date descending
      posts.sort((a, b) => new Date(b.date) - new Date(a.date));

      grid.innerHTML = '';
      posts.forEach((post, i) => {
        const card = createPostCard(post, i);
        grid.appendChild(card);
      });

      // Animate cards in with stagger
      requestAnimationFrame(() => {
        const cards = grid.querySelectorAll('.post-card');
        cards.forEach((card, i) => {
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          setTimeout(() => {
            card.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, 100 + i * 80);
        });
      });

    } catch (e) {
      if (emptyState) emptyState.style.display = 'block';
    }
  }

  function createPostCard(post, index) {
    const card = document.createElement('a');
    card.className = 'post-card';
    card.href = `post.html?slug=${encodeURIComponent(post.slug)}`;

    const date = formatDate(post.date);
    const readingTime = estimateReadingTime(post.excerpt || '');

    let tagsHtml = '';
    if (post.tags && post.tags.length) {
      tagsHtml = post.tags.map(t => `<span class="post-card__tag">${escapeHtml(t)}</span>`).join('');
    }

    card.innerHTML = `
      <div class="post-card__meta">
        <span class="post-card__date">${date}</span>
        <span class="post-card__dot"></span>
        <span class="post-card__reading-time">${readingTime}</span>
        ${tagsHtml}
      </div>
      <h3 class="post-card__title">${escapeHtml(post.title)}</h3>
      <p class="post-card__excerpt">${escapeHtml(post.excerpt || '')}</p>
      <span class="post-card__arrow">&rarr;</span>
    `;

    return card;
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
  document.addEventListener('DOMContentLoaded', () => {
    loadPosts();
    initScrollReveal();
  });
})();
