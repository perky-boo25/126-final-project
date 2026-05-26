// ─── SHARED POLAROID RENDERER ────────────────────────────────────────────────

function renderPinCards(containerId, items, cardMapper) {
  const row = document.getElementById(containerId);
  row.innerHTML = items.map(item => {
    const { imgSrc, imgAlt, title, sub, snippet, dataset } = cardMapper(item);
    const dataAttrs = Object.entries(dataset)
      .map(([k, v]) => `data-${k}="${v}"`)
      .join(' ');
    return `
      <div class="pin-card" ${dataAttrs}>
        <div class="pin-card-img">
          ${imgSrc ? `<img src="${imgSrc}" alt="${imgAlt || ''}">` : ''}
        </div>
        <p class="pin-card-title">${title}</p>
        <p class="pin-card-sub">${sub || ''}</p>
        <p class="pin-card-snippet">${snippet || ''}</p>
      </div>
    `;
  }).join('');
}

// ─── RENDERERS ───────────────────────────────────────────────────────────────

function renderWritings(writings) {
  renderPinCards('writing-pinned-row', writings, w => ({
    imgSrc:  w.image,
    imgAlt:  w.title,
    title:   w.title,
    sub:     `by ${w.author}`,
    snippet: w.snippet || '',
    dataset: {
      title:   w.title,
      author:  w.author,
      label:   w.label || 'Writing',
      content: w.content.replace(/"/g, '&quot;'),
    }
  }));
  initModal('writing-pinned-row', 'writingModalOverlay', pin => {
    document.getElementById('writingModalLabel').textContent  = pin.dataset.label;
    document.getElementById('writingModalTitle').textContent  = pin.dataset.title;
    document.getElementById('writingModalAuthor').textContent = `by ${pin.dataset.author}`;
    document.getElementById('writingModalContent').textContent = pin.dataset.content;
  }, 'writingModalClose');
}

function renderEntries(entries) {
  renderPinCards('entry-card-list', entries, e => ({
    imgSrc:  e.image,
    imgAlt:  e.title,
    title:   e.title,
    sub:     e.date,
    snippet: e.desc,
    dataset: {
      title:  e.title,
      date:   e.date,
      status: e.status,
      meta:   (e.meta || '').replace(/"/g, '&quot;'),
      desc:   e.desc.replace(/"/g, '&quot;'),
    }
  }));
  initModal('entry-card-list', 'entryModalOverlay', pin => {
    document.getElementById('entryModalTitle').textContent = pin.dataset.title;
    document.getElementById('entryModalMeta').textContent  = pin.dataset.meta;
    document.getElementById('entryModalDate').textContent  = pin.dataset.date;
    document.getElementById('entryModalDesc').textContent  = pin.dataset.desc;
    const badge = document.getElementById('entryModalBadge');
    badge.textContent = pin.dataset.status;
    badge.className   = `modal-badge ${pin.dataset.status.toLowerCase()}`;
  }, 'entryModalClose');
}

// ─── SHARED MODAL LOGIC ──────────────────────────────────────────────────────

function initModal(rowId, overlayId, populate, closeBtnId) {
  const overlay = document.getElementById(overlayId);

  function openModal(pin) {
    populate(pin);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll(`#${rowId} .pin-card`).forEach(pin => {
    pin.addEventListener('click', () => openModal(pin));
  });

  document.getElementById(closeBtnId).addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// ─── TAB ACCORDION ───────────────────────────────────────────────────────────

function initTabs() {
  const tabGroups   = Array.from(document.querySelectorAll('.tab-group'));
  const wrapper     = document.querySelector('.tabs-wrapper');
  const BASE_HEIGHT = 500;
  const baseTops    = tabGroups.map(g => g.offsetTop);

  function getFolderHeight(group) {
    const overlay = group.querySelector('.folder-overlay');
    return overlay ? overlay.scrollHeight : 280;
  }

  function applyPositions() {
    let cumulativeShift = 0;
    tabGroups.forEach((group, i) => {
      group.style.top = (baseTops[i] + cumulativeShift) + 'px';
      if (group.classList.contains('open')) {
        const folderH    = getFolderHeight(group);
        const slotHeight = i + 1 < baseTops.length
          ? baseTops[i + 1] - baseTops[i]
          : 120;
        cumulativeShift += Math.max(0, folderH + 20 - slotHeight);
      }
    });
    wrapper.style.height = (BASE_HEIGHT + cumulativeShift) + 'px';
  }

  function toggleTab(group) {
    group.classList.toggle('open');
    applyPositions();
  }

  tabGroups.forEach(group => {
    const header = group.querySelector('.tab-header');
    header.addEventListener('click', () => toggleTab(group));

    const overlay = group.querySelector('.folder-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => toggleTab(group));

      const entries = overlay.querySelector('.folder-entries');
      if (entries) entries.addEventListener('click', e => e.stopPropagation());

      const closeBtn     = document.createElement('button');
      closeBtn.className = 'close-hint';
      closeBtn.innerHTML = '&times;';
      closeBtn.title     = 'Close';
      closeBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleTab(group);
      });
      overlay.appendChild(closeBtn);
    }
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  initTabs();

  fetch('journal.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
      return res.json();
    })
    .then(data => {
      renderWritings(data.writings);
      renderEntries(data.entries);
    })
    .catch(err => console.error('Journal data error:', err));
});