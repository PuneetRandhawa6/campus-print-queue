/* ═══════════════════════════════════════════
   Campus Print Queue — Application Logic
   FIFO Queue Engine + UI Controller
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  // ── Constants ──
  const ADMIN_PASSWORD = 'admin123';
  const STORAGE_KEY    = 'campusPrintQueue';
  const TOKEN_PREFIX   = 'CPQ';
  const MAX_FILE_SIZE  = 25 * 1024 * 1024; // 25 MB

  // ── State ──
  let queue     = [];
  let isAdmin   = false;
  let adminFilter = 'all';
  let uploadedFile = null; // { name, size, type, dataUrl }

  // ── DOM References ──
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Navigation
  const navLinks     = $$('.nav-link');
  const views        = $$('.view');
  const queueBadge   = $('#queue-badge');
  const navTime      = $('#nav-time');

  // Student form
  const printForm    = $('#print-form');
  const studentName  = $('#student-name');
  const rollNumber   = $('#roll-number');
  const pageCount    = $('#page-count');
  const copies       = $('#copies');
  const paperSize    = $('#paper-size');
  const printSide    = $('#print-side');
  const instructions = $('#instructions');
  const fileInput    = $('#file-input');
  const uploadZone   = $('#upload-zone');
  const uploadContent = $('#upload-content');
  const uploadPreview = $('#upload-preview');
  const previewIcon  = $('#preview-icon');
  const previewName  = $('#preview-name');
  const previewSize  = $('#preview-size');
  const previewRemove = $('#preview-remove');
  const submitBtn    = $('#submit-btn');

  // Color mode toggle
  const toggleBW     = $('#toggle-bw');
  const toggleColor  = $('#toggle-color');
  let colorMode      = 'bw';

  // Copies stepper
  const copiesMinus  = $('#copies-minus');
  const copiesPlus   = $('#copies-plus');

  // Success modal
  const successModal = $('#success-modal');
  const modalTokenVal = $('#modal-token-value');
  const modalClose   = $('#modal-close');

  // Queue view
  const queueList    = $('#queue-list');
  const queueEmpty   = $('#queue-empty');
  const statPending  = $('#stat-pending .stat-value');
  const statProcessing = $('#stat-processing .stat-value');
  const statDone     = $('#stat-done .stat-value');

  // Admin
  const adminLogin   = $('#admin-login');
  const adminDashboard = $('#admin-dashboard');
  const loginForm    = $('#login-form');
  const adminPassword = $('#admin-password');
  const loginError   = $('#login-error');
  const adminQueue   = $('#admin-queue');
  const adminQueueEmpty = $('#admin-queue-empty');
  const adminLogout  = $('#admin-logout');
  const adminClearDone = $('#admin-clear-done');
  const filterChips  = $$('.filter-chip');

  // Toast
  const toastContainer = $('#toast-container');

  // ══════════════════════════
  // 1. Persistence (localStorage)
  // ══════════════════════════

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('Could not save queue to localStorage', e);
    }
  }

  function load() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) queue = JSON.parse(data);
    } catch (e) {
      queue = [];
    }
  }

  // ══════════════════════════
  // 2. Token Generator
  // ══════════════════════════

  function generateToken() {
    const now = new Date();
    const datePart = `${String(now.getDate()).padStart(2,'0')}${String(now.getMonth()+1).padStart(2,'0')}`;
    const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${TOKEN_PREFIX}-${datePart}-${rand}`;
  }

  // ══════════════════════════
  // 3. Navigation
  // ══════════════════════════

  function switchView(viewName) {
    navLinks.forEach(l => l.classList.toggle('active', l.dataset.view === viewName));
    views.forEach(v => {
      v.classList.remove('active');
      // Remove and re-add to retrigger animation
      if (v.id === `view-${viewName}`) {
        void v.offsetWidth; // force reflow
        v.classList.add('active');
      }
    });

    if (viewName === 'queue') renderQueue();
    if (viewName === 'admin') renderAdmin();
  }

  navLinks.forEach(link => {
    link.addEventListener('click', () => switchView(link.dataset.view));
  });

  $('#nav-brand').addEventListener('click', () => switchView('student'));

  // ══════════════════════════
  // 4. Clock
  // ══════════════════════════

  function updateClock() {
    const now = new Date();
    navTime.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  updateClock();
  setInterval(updateClock, 30000);

  // ══════════════════════════
  // 5. Hero Particles
  // ══════════════════════════

  function spawnParticles() {
    const container = $('#hero-particles');
    if (!container) return;
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = (50 + Math.random() * 50) + '%';
      p.style.animationDelay = (Math.random() * 5) + 's';
      p.style.animationDuration = (4 + Math.random() * 4) + 's';
      container.appendChild(p);
    }
  }
  spawnParticles();

  // ══════════════════════════
  // 6. Color Mode Toggle
  // ══════════════════════════

  toggleBW.addEventListener('click', () => {
    colorMode = 'bw';
    toggleBW.classList.add('active');
    toggleColor.classList.remove('active');
  });

  toggleColor.addEventListener('click', () => {
    colorMode = 'color';
    toggleColor.classList.add('active');
    toggleBW.classList.remove('active');
  });

  // ══════════════════════════
  // 7. Copies Stepper
  // ══════════════════════════

  copiesMinus.addEventListener('click', () => {
    const val = parseInt(copies.value) || 1;
    if (val > 1) copies.value = val - 1;
  });

  copiesPlus.addEventListener('click', () => {
    const val = parseInt(copies.value) || 1;
    if (val < 50) copies.value = val + 1;
  });

  // ══════════════════════════
  // 8. File Upload
  // ══════════════════════════

  function fileIcon(type) {
    if (type.includes('pdf')) return '📕';
    if (type.includes('word') || type.includes('doc')) return '📘';
    if (type.includes('presentation') || type.includes('ppt')) return '📙';
    if (type.includes('sheet') || type.includes('xls')) return '📗';
    if (type.includes('image')) return '🖼️';
    return '📄';
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function handleFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast('⚠️', 'File exceeds the 25 MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedFile = {
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: e.target.result
      };

      previewIcon.textContent = fileIcon(file.type);
      previewName.textContent = file.name;
      previewSize.textContent = formatSize(file.size);
      uploadContent.classList.add('hidden');
      uploadPreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  uploadZone.addEventListener('click', (e) => {
    if (e.target === previewRemove || e.target.closest('.preview-remove')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  previewRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    uploadedFile = null;
    fileInput.value = '';
    uploadContent.classList.remove('hidden');
    uploadPreview.classList.add('hidden');
  });

  // ══════════════════════════
  // 9. Form Submit — FIFO Queue
  // ══════════════════════════

  printForm.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!uploadedFile) {
      showToast('⚠️', 'Please upload a document first.');
      return;
    }

    const token = generateToken();

    const job = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      token,
      name:        studentName.value.trim(),
      roll:        rollNumber.value.trim(),
      pages:       parseInt(pageCount.value) || 1,
      colorMode,
      copies:      parseInt(copies.value) || 1,
      paperSize:   paperSize.value,
      sides:       printSide.value,
      instructions: instructions.value.trim(),
      file: {
        name:    uploadedFile.name,
        size:    uploadedFile.size,
        type:    uploadedFile.type,
        dataUrl: uploadedFile.dataUrl
      },
      status:      'pending',   // pending → processing → done
      submittedAt: new Date().toISOString()
    };

    // FIFO: push to end
    queue.push(job);
    save();
    updateBadge();

    // Show success modal
    modalTokenVal.textContent = token;
    successModal.classList.remove('hidden');

    // Reset form
    printForm.reset();
    colorMode = 'bw';
    toggleBW.classList.add('active');
    toggleColor.classList.remove('active');
    copies.value = 1;
    uploadedFile = null;
    fileInput.value = '';
    uploadContent.classList.remove('hidden');
    uploadPreview.classList.add('hidden');

    showToast('✅', `Job ${token} added to the queue.`);
  });

  modalClose.addEventListener('click', () => {
    successModal.classList.add('hidden');
  });

  successModal.addEventListener('click', (e) => {
    if (e.target === successModal) successModal.classList.add('hidden');
  });

  // ══════════════════════════
  // 10. Badge Update
  // ══════════════════════════

  function updateBadge() {
    const pending = queue.filter(j => j.status !== 'done').length;
    queueBadge.textContent = pending;
    queueBadge.classList.add('pulse');
    setTimeout(() => queueBadge.classList.remove('pulse'), 500);
  }

  // ══════════════════════════
  // 11. Queue View Rendering
  // ══════════════════════════

  function renderQueue() {
    const pendingJobs = queue.filter(j => j.status === 'pending');
    const processingJobs = queue.filter(j => j.status === 'processing');
    const doneJobs = queue.filter(j => j.status === 'done');

    statPending.textContent = pendingJobs.length;
    statProcessing.textContent = processingJobs.length;
    statDone.textContent = doneJobs.length;

    if (queue.length === 0) {
      queueEmpty.classList.remove('hidden');
      // Remove all cards
      queueList.querySelectorAll('.queue-card').forEach(c => c.remove());
      return;
    }

    queueEmpty.classList.add('hidden');

    // Build cards
    let html = '';
    let position = 1;
    // Show in FIFO order (oldest first)
    queue.forEach((job) => {
      const statusClass = `status-${job.status}`;
      const statusLabel = job.status === 'processing' ? 'Printing' : job.status.charAt(0).toUpperCase() + job.status.slice(1);
      const time = new Date(job.submittedAt);
      const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const colorLabel = job.colorMode === 'color' ? '🌈 Color' : '◐ B&W';

      html += `
        <div class="queue-card" data-id="${job.id}">
          <div class="queue-position">${position}</div>
          <div class="queue-info">
            <div class="queue-name">${escapeHtml(job.name)} <span style="color:var(--text-muted);font-weight:400;font-size:0.82rem;">(${escapeHtml(job.roll)})</span></div>
            <div class="queue-details">
              <span class="queue-detail-item">📄 ${job.pages} pg</span>
              <span class="queue-detail-item">${colorLabel}</span>
              <span class="queue-detail-item">📋 ×${job.copies}</span>
              <span class="queue-detail-item">🕐 ${timeStr}</span>
            </div>
          </div>
          <span class="queue-status ${statusClass}">${statusLabel}</span>
        </div>
      `;
      position++;
    });

    // Replace content (keep the empty placeholder)
    queueList.querySelectorAll('.queue-card').forEach(c => c.remove());
    queueList.insertAdjacentHTML('beforeend', html);
  }

  // ══════════════════════════
  // 12. Admin Login
  // ══════════════════════════

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (adminPassword.value === ADMIN_PASSWORD) {
      isAdmin = true;
      loginError.classList.add('hidden');
      adminLogin.classList.add('hidden');
      adminDashboard.classList.remove('hidden');
      renderAdmin();
      showToast('🔓', 'Admin panel unlocked.');
    } else {
      loginError.classList.remove('hidden');
      adminPassword.value = '';
    }
  });

  adminLogout.addEventListener('click', () => {
    isAdmin = false;
    adminDashboard.classList.add('hidden');
    adminLogin.classList.remove('hidden');
    adminPassword.value = '';
    showToast('🔒', 'Logged out of admin panel.');
  });

  // ══════════════════════════
  // 13. Admin Dashboard Rendering
  // ══════════════════════════

  function renderAdmin() {
    if (!isAdmin) return;

    let filtered = queue;
    if (adminFilter !== 'all') {
      filtered = queue.filter(j => j.status === adminFilter);
    }

    if (filtered.length === 0) {
      adminQueueEmpty.classList.remove('hidden');
      adminQueue.querySelectorAll('.admin-card').forEach(c => c.remove());
      return;
    }

    adminQueueEmpty.classList.add('hidden');

    let html = '';
    filtered.forEach(job => {
      const time = new Date(job.submittedAt);
      const timeStr = time.toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      const colorLabel = job.colorMode === 'color' ? 'Color' : 'Black & White';
      const sidesLabel = job.sides === 'double' ? 'Double-sided' : 'Single-sided';

      let actionBtns = '';
      if (job.status === 'pending') {
        actionBtns += `<button class="admin-action-btn processing-btn" data-action="processing" data-id="${job.id}">⚙️ Start Printing</button>`;
      }
      if (job.status === 'processing') {
        actionBtns += `<button class="admin-action-btn done-btn" data-action="done" data-id="${job.id}">✅ Mark Done</button>`;
      }
      actionBtns += `<button class="admin-action-btn download-btn" data-action="download" data-id="${job.id}">📥 Download</button>`;
      if (job.status === 'done') {
        actionBtns += `<button class="admin-action-btn delete-btn" data-action="delete" data-id="${job.id}">🗑️ Delete</button>`;
      }

      const statusClass = `status-${job.status}`;
      const statusLabel = job.status === 'processing' ? 'Printing' : job.status.charAt(0).toUpperCase() + job.status.slice(1);

      html += `
        <div class="admin-card" data-id="${job.id}">
          <div class="admin-card-header">
            <div class="admin-card-title">
              <span class="admin-card-token">${job.token}</span>
              <span class="admin-card-name">${escapeHtml(job.name)}</span>
              <span class="admin-card-roll">${escapeHtml(job.roll)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="queue-status ${statusClass}">${statusLabel}</span>
              <span class="admin-card-time">${timeStr}</span>
            </div>
          </div>
          <div class="admin-card-body">
            <div class="admin-detail">
              <span class="admin-detail-label">Pages</span>
              <span class="admin-detail-value">${job.pages}</span>
            </div>
            <div class="admin-detail">
              <span class="admin-detail-label">Copies</span>
              <span class="admin-detail-value">${job.copies}</span>
            </div>
            <div class="admin-detail">
              <span class="admin-detail-label">Color</span>
              <span class="admin-detail-value">${colorLabel}</span>
            </div>
            <div class="admin-detail">
              <span class="admin-detail-label">Paper</span>
              <span class="admin-detail-value">${job.paperSize}</span>
            </div>
            <div class="admin-detail">
              <span class="admin-detail-label">Sides</span>
              <span class="admin-detail-value">${sidesLabel}</span>
            </div>
            <div class="admin-detail">
              <span class="admin-detail-label">File</span>
              <span class="admin-detail-value" title="${escapeHtml(job.file.name)}">${escapeHtml(truncateFilename(job.file.name, 20))}</span>
            </div>
          </div>
          ${job.instructions ? `<div class="admin-instructions">💬 ${escapeHtml(job.instructions)}</div>` : ''}
          <div class="admin-card-footer">
            <div class="admin-card-actions">
              ${actionBtns}
            </div>
          </div>
        </div>
      `;
    });

    adminQueue.querySelectorAll('.admin-card').forEach(c => c.remove());
    adminQueue.insertAdjacentHTML('beforeend', html);

    // Rebind action buttons
    adminQueue.querySelectorAll('.admin-action-btn').forEach(btn => {
      btn.addEventListener('click', handleAdminAction);
    });
  }

  // ══════════════════════════
  // 14. Admin Actions
  // ══════════════════════════

  function handleAdminAction(e) {
    const action = e.currentTarget.dataset.action;
    const id     = e.currentTarget.dataset.id;
    const job    = queue.find(j => j.id === id);
    if (!job) return;

    switch (action) {
      case 'processing':
        job.status = 'processing';
        save();
        renderAdmin();
        updateBadge();
        showToast('⚙️', `Now printing: ${job.token}`);
        break;

      case 'done':
        job.status = 'done';
        save();
        renderAdmin();
        updateBadge();
        showToast('✅', `Completed: ${job.token}`);
        break;

      case 'download':
        downloadFile(job);
        break;

      case 'delete':
        queue = queue.filter(j => j.id !== id);
        save();
        renderAdmin();
        updateBadge();
        showToast('🗑️', `Deleted: ${job.token}`);
        break;
    }
  }

  function downloadFile(job) {
    if (!job.file || !job.file.dataUrl) {
      showToast('⚠️', 'No file attached to this job.');
      return;
    }
    const link = document.createElement('a');
    link.href = job.file.dataUrl;
    link.download = job.file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📥', `Downloading: ${job.file.name}`);
  }

  // Filters
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      adminFilter = chip.dataset.filter;
      renderAdmin();
    });
  });

  // Clear completed
  adminClearDone.addEventListener('click', () => {
    const beforeLen = queue.length;
    queue = queue.filter(j => j.status !== 'done');
    save();
    renderAdmin();
    updateBadge();
    const cleared = beforeLen - queue.length;
    showToast('🧹', `Cleared ${cleared} completed job${cleared !== 1 ? 's' : ''}.`);
  });

  // ══════════════════════════
  // 15. Toast Notifications
  // ══════════════════════════

  function showToast(icon, message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-text">${message}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ══════════════════════════
  // 16. Helpers
  // ══════════════════════════

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function truncateFilename(name, max) {
    if (name.length <= max) return name;
    const ext = name.split('.').pop();
    return name.slice(0, max - ext.length - 4) + '….' + ext;
  }

  // ══════════════════════════
  // Boot
  // ══════════════════════════

  load();
  updateBadge();

})();
