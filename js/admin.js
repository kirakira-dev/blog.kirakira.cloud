// blog.kirakira.cloud — Admin Panel
// Auth, GitHub API, post editor, post management

(function () {
  'use strict';

  // --- Config ---
  const AUTH = {
    username: 'kira',
    // SHA-256 hash of the password
    passwordHash: 'a7dd2fe48f961248de5ca13473e38c45e1755c124dcead4ec81048fe26b44a57'
  };

  const STORAGE_KEYS = {
    token: 'blog_github_token',
    repo: 'blog_github_repo',
    branch: 'blog_github_branch',
    session: 'blog_admin_session'
  };

  // --- State ---
  let currentPosts = [];
  let editingSlug = null; // null = new post, string = editing existing

  // --- Elements ---
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const toast = document.getElementById('toast');
  const loading = document.getElementById('loading');
  const confirmDialog = document.getElementById('confirm-dialog');

  // Views
  const viewPosts = document.getElementById('view-posts');
  const viewEditor = document.getElementById('view-editor');
  const viewSettings = document.getElementById('view-settings');
  const viewLabel = document.getElementById('view-label');
  const viewTitle = document.getElementById('view-title');

  // Token
  const tokenSetup = document.getElementById('token-setup');
  const tokenStatus = document.getElementById('token-status');

  // Editor
  const editorTitle = document.getElementById('editor-title');
  const editorSlug = document.getElementById('editor-slug');
  const editorTags = document.getElementById('editor-tags');
  const editorExcerpt = document.getElementById('editor-excerpt');
  const editorContent = document.getElementById('editor-content');
  const editorPreview = document.getElementById('editor-preview');
  const editorWordcount = document.getElementById('editor-wordcount');

  // --- Auth ---
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function authenticate(username, password) {
    if (username !== AUTH.username) return false;
    const hash = await hashPassword(password);
    return hash === AUTH.passwordHash;
  }

  function isLoggedIn() {
    return sessionStorage.getItem(STORAGE_KEYS.session) === 'authenticated';
  }

  function login() {
    sessionStorage.setItem(STORAGE_KEYS.session, 'authenticated');
    showDashboard();
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEYS.session);
    showLogin();
  }

  // --- UI Transitions ---
  function showLogin() {
    dashboard.classList.remove('active', 'visible');
    loginScreen.style.display = 'flex';
    loginScreen.style.opacity = '0';
    requestAnimationFrame(() => {
      loginScreen.style.transition = 'opacity 0.4s ease-out';
      loginScreen.style.opacity = '1';
    });
  }

  function showDashboard() {
    loginScreen.style.opacity = '0';
    setTimeout(() => {
      loginScreen.style.display = 'none';
      dashboard.classList.add('active');
      requestAnimationFrame(() => {
        dashboard.classList.add('visible');
      });
      initDashboard();
    }, 400);
  }

  function switchView(view, label, title) {
    [viewPosts, viewEditor, viewSettings].forEach(v => {
      v.classList.remove('active', 'visible');
    });
    viewLabel.textContent = label;
    viewTitle.textContent = title;
    view.classList.add('active');
    requestAnimationFrame(() => {
      setTimeout(() => view.classList.add('visible'), 20);
    });
  }

  // --- Toast ---
  let toastTimeout;
  function showToast(message, type = 'info') {
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.className = `toast toast--${type}`;
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });
    toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3000);
  }

  // --- Loading ---
  function showLoading() {
    loading.classList.add('visible');
  }
  function hideLoading() {
    loading.classList.remove('visible');
  }

  // --- Confirm dialog ---
  function showConfirm(title, text) {
    return new Promise((resolve) => {
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-text').textContent = text;
      confirmDialog.classList.add('visible');

      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');

      function cleanup() {
        confirmDialog.classList.remove('visible');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
      }

      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
    });
  }

  // --- GitHub API ---
  function getGitHubConfig() {
    return {
      token: localStorage.getItem(STORAGE_KEYS.token) || '',
      repo: localStorage.getItem(STORAGE_KEYS.repo) || '',
      branch: localStorage.getItem(STORAGE_KEYS.branch) || 'main'
    };
  }

  function hasGitHubConfig() {
    const config = getGitHubConfig();
    return config.token && config.repo;
  }

  async function githubAPI(path, method = 'GET', body = null) {
    const config = getGitHubConfig();
    const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;

    const headers = {
      'Authorization': `token ${config.token}`,
      'Accept': 'application/vnd.github.v3+json'
    };

    const opts = { method, headers };
    if (body) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    const resp = await fetch(url, opts);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API error: ${resp.status}`);
    }
    return resp.json();
  }

  async function getFileSha(path) {
    try {
      const data = await githubAPI(path);
      return data.sha;
    } catch {
      return null;
    }
  }

  async function putFile(path, content, message) {
    const config = getGitHubConfig();
    const sha = await getFileSha(path);
    const body = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: config.branch
    };
    if (sha) body.sha = sha;
    return githubAPI(path, 'PUT', body);
  }

  async function deleteFile(path, message) {
    const config = getGitHubConfig();
    const sha = await getFileSha(path);
    if (!sha) return;
    const url = `https://api.github.com/repos/${config.repo}/contents/${path}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${config.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message, sha, branch: config.branch })
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message || `Delete failed: ${resp.status}`);
    }
  }

  // --- Posts Management ---
  async function loadPostsIndex() {
    try {
      const config = getGitHubConfig();
      if (!config.token || !config.repo) {
        // Try loading from local
        const resp = await fetch('../posts/_index.json');
        if (resp.ok) {
          currentPosts = await resp.json();
        } else {
          currentPosts = [];
        }
        return;
      }

      const data = await githubAPI('posts/_index.json');
      const content = decodeURIComponent(escape(atob(data.content)));
      currentPosts = JSON.parse(content);
    } catch {
      // Try local fallback
      try {
        const resp = await fetch('../posts/_index.json');
        if (resp.ok) {
          currentPosts = await resp.json();
        } else {
          currentPosts = [];
        }
      } catch {
        currentPosts = [];
      }
    }
  }

  function renderPostsList() {
    const list = document.getElementById('admin-posts-list');
    const empty = document.getElementById('admin-empty');

    if (!currentPosts.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    const sorted = [...currentPosts].sort((a, b) => new Date(b.date) - new Date(a.date));

    list.innerHTML = sorted.map((post, i) => `
      <div class="admin-post-item" style="opacity: 0; transform: translateX(-10px); transition: opacity 0.4s ease-out ${i * 60}ms, transform 0.4s ease-out ${i * 60}ms, border-color 0.3s ease;">
        <div class="admin-post-item__info">
          <div class="admin-post-item__title">${escapeHtml(post.title)}</div>
          <div class="admin-post-item__meta">
            ${formatDate(post.date)} &middot; ${post.slug}
            ${post.tags ? ' &middot; ' + post.tags.join(', ') : ''}
          </div>
        </div>
        <div class="admin-post-item__actions">
          <button class="btn btn--secondary btn--small" onclick="window._admin.editPost('${escapeHtml(post.slug)}')">edit</button>
          <button class="btn btn--danger btn--small" onclick="window._admin.deletePost('${escapeHtml(post.slug)}')">delete</button>
        </div>
      </div>
    `).join('');

    // Animate in
    requestAnimationFrame(() => {
      list.querySelectorAll('.admin-post-item').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(0)';
      });
    });
  }

  // --- Editor ---
  function openEditor(post = null) {
    if (post) {
      editingSlug = post.slug;
      editorTitle.value = post.title;
      editorSlug.value = post.slug;
      editorTags.value = (post.tags || []).join(', ');
      editorExcerpt.value = post.excerpt || '';
      editorContent.value = post.content || '';
      switchView(viewEditor, '// editor', `editing: ${post.title}`);
    } else {
      editingSlug = null;
      editorTitle.value = '';
      editorSlug.value = '';
      editorTags.value = '';
      editorExcerpt.value = '';
      editorContent.value = '';
      switchView(viewEditor, '// editor', 'new post');
    }
    updatePreview();
    updateWordcount();
  }

  async function loadPostForEditing(slug) {
    showLoading();
    try {
      const config = getGitHubConfig();
      let post;

      if (config.token && config.repo) {
        const data = await githubAPI(`posts/${slug}.json`);
        const content = decodeURIComponent(escape(atob(data.content)));
        post = JSON.parse(content);
      } else {
        const resp = await fetch(`../posts/${slug}.json`);
        post = await resp.json();
      }

      openEditor(post);
    } catch (e) {
      showToast('Failed to load post: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  async function publishPost() {
    const title = editorTitle.value.trim();
    const slug = editorSlug.value.trim() || slugify(title);
    const tags = editorTags.value.split(',').map(t => t.trim()).filter(Boolean);
    const excerpt = editorExcerpt.value.trim();
    const content = editorContent.value;

    if (!title) {
      showToast('Title is required', 'error');
      return;
    }
    if (!slug) {
      showToast('Slug is required', 'error');
      return;
    }
    if (!content.trim()) {
      showToast('Content is required', 'error');
      return;
    }

    if (!hasGitHubConfig()) {
      showToast('GitHub token required — configure in settings', 'error');
      return;
    }

    showLoading();
    try {
      const post = {
        title,
        slug,
        date: editingSlug ? (currentPosts.find(p => p.slug === editingSlug)?.date || new Date().toISOString()) : new Date().toISOString(),
        tags,
        excerpt,
        content
      };

      // Save post file
      await putFile(
        `posts/${slug}.json`,
        JSON.stringify(post, null, 2),
        editingSlug ? `Update post: ${title}` : `Add post: ${title}`
      );

      // Update index
      if (editingSlug && editingSlug !== slug) {
        // Slug changed, remove old file
        await deleteFile(`posts/${editingSlug}.json`, `Remove old slug: ${editingSlug}`);
        currentPosts = currentPosts.filter(p => p.slug !== editingSlug);
      } else {
        currentPosts = currentPosts.filter(p => p.slug !== slug);
      }

      currentPosts.push({
        title,
        slug,
        date: post.date,
        tags,
        excerpt
      });

      await putFile(
        'posts/_index.json',
        JSON.stringify(currentPosts, null, 2),
        `Update posts index`
      );

      showToast('Post published successfully!', 'success');
      editingSlug = null;
      switchView(viewPosts, '// posts', 'manage posts');
      renderPostsList();
    } catch (e) {
      showToast('Publish failed: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  async function deletePost(slug) {
    const ok = await showConfirm(
      'Delete post?',
      `This will permanently delete "${slug}". This cannot be undone.`
    );
    if (!ok) return;

    if (!hasGitHubConfig()) {
      showToast('GitHub token required for deletion', 'error');
      return;
    }

    showLoading();
    try {
      await deleteFile(`posts/${slug}.json`, `Delete post: ${slug}`);
      currentPosts = currentPosts.filter(p => p.slug !== slug);
      await putFile(
        'posts/_index.json',
        JSON.stringify(currentPosts, null, 2),
        'Update posts index (delete)'
      );
      showToast('Post deleted', 'success');
      renderPostsList();
    } catch (e) {
      showToast('Delete failed: ' + e.message, 'error');
    } finally {
      hideLoading();
    }
  }

  function updatePreview() {
    const md = editorContent.value;
    if (typeof marked !== 'undefined' && md.trim()) {
      marked.setOptions({ gfm: true, breaks: true });
      editorPreview.innerHTML = marked.parse(md);
    } else if (!md.trim()) {
      editorPreview.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">start typing to see preview...</p>';
    }
  }

  function updateWordcount() {
    const words = editorContent.value.trim().split(/\s+/).filter(Boolean).length;
    editorWordcount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  }

  // --- Auto-generate slug ---
  function slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // --- Token UI ---
  function updateTokenUI() {
    const config = getGitHubConfig();
    if (config.token && config.repo) {
      tokenSetup.style.display = 'none';
      tokenStatus.className = 'token-status token-status--ok';
      tokenStatus.textContent = '● connected';
    } else {
      tokenSetup.style.display = 'block';
      tokenStatus.className = 'token-status token-status--missing';
      tokenStatus.textContent = '○ not configured';
    }
  }

  // --- Dashboard Init ---
  async function initDashboard() {
    updateTokenUI();
    await loadPostsIndex();
    renderPostsList();

    // Load settings values
    const config = getGitHubConfig();
    document.getElementById('settings-token').value = config.token;
    document.getElementById('settings-repo').value = config.repo;
    document.getElementById('settings-branch').value = config.branch || 'main';
  }

  // --- Helpers ---
  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Event Listeners ---
  document.addEventListener('DOMContentLoaded', () => {
    // Check session
    if (isLoggedIn()) {
      loginScreen.style.display = 'none';
      dashboard.classList.add('active', 'visible');
      initDashboard();
    }

    // Login form
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const btn = document.getElementById('login-btn');

      btn.textContent = 'authenticating...';
      btn.disabled = true;

      const valid = await authenticate(username, password);

      if (valid) {
        loginError.classList.remove('visible');
        login();
      } else {
        loginError.classList.add('visible');
        btn.textContent = 'sign in';
        btn.disabled = false;

        // Shake animation
        const card = document.querySelector('.login-card');
        card.style.animation = 'none';
        card.offsetHeight; // reflow
        card.style.animation = 'shake 0.4s ease-out';
      }
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', () => {
      logout();
    });

    // New post
    document.getElementById('btn-new-post').addEventListener('click', () => {
      openEditor();
    });

    // Cancel edit
    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
      editingSlug = null;
      switchView(viewPosts, '// posts', 'manage posts');
    });

    // Publish
    document.getElementById('btn-publish').addEventListener('click', publishPost);

    // Editor live preview
    editorContent.addEventListener('input', () => {
      updatePreview();
      updateWordcount();
    });

    // Auto-slug from title
    editorTitle.addEventListener('input', () => {
      if (!editingSlug) {
        editorSlug.value = slugify(editorTitle.value);
      }
    });

    // Token setup (banner)
    document.getElementById('btn-save-token').addEventListener('click', () => {
      const token = document.getElementById('github-token').value.trim();
      const repo = document.getElementById('github-repo').value.trim();
      if (!token || !repo) {
        showToast('Token and repo are required', 'error');
        return;
      }
      localStorage.setItem(STORAGE_KEYS.token, token);
      localStorage.setItem(STORAGE_KEYS.repo, repo);
      updateTokenUI();
      showToast('GitHub config saved!', 'success');
    });

    // Settings
    document.getElementById('btn-settings').addEventListener('click', () => {
      switchView(viewSettings, '// settings', 'configuration');
    });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
      const token = document.getElementById('settings-token').value.trim();
      const repo = document.getElementById('settings-repo').value.trim();
      const branch = document.getElementById('settings-branch').value.trim() || 'main';

      if (token) localStorage.setItem(STORAGE_KEYS.token, token);
      if (repo) localStorage.setItem(STORAGE_KEYS.repo, repo);
      localStorage.setItem(STORAGE_KEYS.branch, branch);

      updateTokenUI();
      showToast('Settings saved!', 'success');
    });

    document.getElementById('btn-back-settings').addEventListener('click', () => {
      switchView(viewPosts, '// posts', 'manage posts');
    });
  });

  // Expose functions for inline handlers
  window._admin = {
    editPost: (slug) => loadPostForEditing(slug),
    deletePost: (slug) => deletePost(slug)
  };

  // --- Shake animation ---
  const shakeStyle = document.createElement('style');
  shakeStyle.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-8px); }
      40% { transform: translateX(8px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
  `;
  document.head.appendChild(shakeStyle);
})();
