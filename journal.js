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
      image:   w.image || '',
    }
  }));
  initModal('writing-pinned-row', 'writingModalOverlay', pin => {
    const wHeroImg = document.getElementById('writingModalHeroImg');
    const wHeroPlaceholder = document.getElementById('writingModalHeroPlaceholder');
    if (pin.dataset.image) {
      wHeroImg.src = pin.dataset.image;
      wHeroImg.style.display = 'block';
      wHeroPlaceholder.style.display = 'none';
    } else {
      wHeroImg.style.display = 'none';
      wHeroImg.src = '';
      wHeroPlaceholder.style.display = 'flex';
    }
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
      image:  e.image || '',
    }
  }));
  initModal('entry-card-list', 'entryModalOverlay', pin => {
    const heroImg = document.getElementById('entryModalHeroImg');
    const heroPlaceholder = document.getElementById('entryModalHeroPlaceholder');
    if (pin.dataset.image) {
      heroImg.src = pin.dataset.image;
      heroImg.style.display = 'block';
      heroPlaceholder.style.display = 'none';
    } else {
      heroImg.style.display = 'none';
      heroImg.src = '';
      heroPlaceholder.style.display = 'flex';
    }
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
  const tabGroups = Array.from(document.querySelectorAll('.tab-group'));
  const wrapper   = document.querySelector('.tabs-wrapper');

  const baseTops = tabGroups.map(g => g.offsetTop);

  // How much the next tab slides UP to cover the transparent bottom of the folder PNG
  const OVERLAP = 40;
  // Extra breathing room below the last entry card before the next tab starts
  const BOTTOM_PADDING = 10;

  function getEntriesHeight(group) {
    const entries = group.querySelector('.folder-entries');
    return entries ? entries.scrollHeight : 0;
  }

  function getTabHeaderHeight(group) {
    const tabHeader = group.querySelector('.tab-header');
    return tabHeader ? tabHeader.offsetHeight : 0;
  }

  function applyPositions() {
    let cumulativeShift = 0;

    tabGroups.forEach((group, i) => {
      group.style.top = (baseTops[i] + cumulativeShift) + 'px';

      const overlay = group.querySelector('.folder-overlay');

      if (group.classList.contains('open')) {
        const tabH     = getTabHeaderHeight(group);
        const entriesH = getEntriesHeight(group);
        // Total visible folder height = tab header + entries content + bottom padding
        const totalH   = tabH + entriesH + BOTTOM_PADDING;

        // Explicitly size the overlay so folder-img (position:absolute inset:0) fills it
        if (overlay) overlay.style.height = totalH + 'px';

        const slotHeight = i + 1 < baseTops.length
          ? baseTops[i + 1] - baseTops[i]
          : 0;

        cumulativeShift += Math.max(0, totalH - slotHeight - OVERLAP - 300);
      } else {
        if (overlay) overlay.style.height = '';
      }
    });

    // Calculate wrapper height from the actual bottom of the last tab
    const last    = tabGroups[tabGroups.length - 1];
    const lastTop = parseFloat(last.style.top) || baseTops[tabGroups.length - 1];
    let lastH = 0;
    if (last.classList.contains('open')) {
      lastH = getTabHeaderHeight(last) + getEntriesHeight(last) + BOTTOM_PADDING - OVERLAP;
    } else {
      // Use the actual rendered height of the tab header image
      const lastHeader = last.querySelector('.tab-header');
      lastH = lastHeader ? lastHeader.offsetHeight : 0;
    }
    wrapper.style.height = (lastTop + lastH) + 'px';
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

    // Re-measure whenever content size changes (async card load)
    const entries = group.querySelector('.folder-entries');
    if (entries && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (group.classList.contains('open')) applyPositions();
      });
      ro.observe(entries);
    }
  });

  return applyPositions;
}

// ─── ADD ENTRY MODAL ─────────────────────────────────────────────────────────

function initAddEntryModal() {
  const overlay      = document.getElementById('addEntryOverlay');
  const closeBtn     = document.getElementById('addEntryClose');
  const titleInput   = document.getElementById('addEntryTitle');
  const bodyInput    = document.getElementById('addEntryBody');
  const privBtn      = document.getElementById('addEntryPrivate');
  const postBtn      = document.getElementById('addEntryPost');
  const imgInput     = document.getElementById('addEntryImgInput');
  const thumbArea    = document.getElementById('addEntryThumb');
  const thumbPreview = document.getElementById('addEntryThumbPreview');
  const thumbHolder  = document.getElementById('addEntryThumbPlaceholder');
  const addBtn       = document.querySelector('.add-btn');

  let thumbnailDataUrl = '';

  function openModal() {
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => titleInput.focus(), 320);
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function resetForm() {
    titleInput.value  = '';
    bodyInput.value   = '';
    thumbnailDataUrl  = '';
    thumbPreview.src  = '';
    thumbPreview.style.display  = 'none';
    thumbHolder.style.display   = 'flex';
  }

  // Thumbnail click → file picker
  thumbArea.addEventListener('click', () => imgInput.click());

  imgInput.addEventListener('change', () => {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      thumbnailDataUrl = e.target.result;
      thumbPreview.src = thumbnailDataUrl;
      thumbPreview.style.display = 'block';
      thumbHolder.style.display  = 'none';
    };
    reader.readAsDataURL(file);
  });

  function submitEntry(status) {
    const title = titleInput.value.trim() || 'Untitled';
    const desc  = bodyInput.value.trim()  || '';

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const newEntry = {
      title,
      status,
      meta:  'Personal · just now',
      image: thumbnailDataUrl,
      desc,
      date:  dateStr,
    };

    // Inject into the DOM immediately
    const row = document.getElementById('entry-card-list');
    const card = document.createElement('div');
    card.className = 'pin-card';

    // Assign dataset for modal use
    card.dataset.title  = newEntry.title;
    card.dataset.date   = newEntry.date;
    card.dataset.status = newEntry.status;
    card.dataset.meta   = newEntry.meta;
    card.dataset.desc   = newEntry.desc;

    card.innerHTML = `
      <div class="pin-card-img">
        ${newEntry.image ? `<img src="${newEntry.image}" alt="${newEntry.title}">` : ''}
      </div>
      <p class="pin-card-title">${newEntry.title}</p>
      <p class="pin-card-sub">${newEntry.date}</p>
      <p class="pin-card-snippet">${newEntry.desc}</p>
    `;

    // Prepend so newest shows first
    row.insertBefore(card, row.firstChild);

    // Wire up the new card to the existing entry modal
    card.addEventListener('click', () => {
      const heroImg2 = document.getElementById('entryModalHeroImg');
      const heroPlaceholder2 = document.getElementById('entryModalHeroPlaceholder');
      if (card.dataset.image) {
        heroImg2.src = card.dataset.image;
        heroImg2.style.display = 'block';
        heroPlaceholder2.style.display = 'none';
      } else {
        heroImg2.style.display = 'none';
        heroImg2.src = '';
        heroPlaceholder2.style.display = 'flex';
      }
      document.getElementById('entryModalTitle').textContent = card.dataset.title;
      document.getElementById('entryModalMeta').textContent  = card.dataset.meta;
      document.getElementById('entryModalDate').textContent  = card.dataset.date;
      document.getElementById('entryModalDesc').textContent  = card.dataset.desc;
      const badge = document.getElementById('entryModalBadge');
      badge.textContent = card.dataset.status;
      badge.className   = `modal-badge ${card.dataset.status.toLowerCase()}`;
      document.getElementById('entryModalOverlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    closeModal();
    resetForm();
  }

  addBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  privBtn.addEventListener('click',      () => submitEntry('Private'));
  postBtn.addEventListener('click',      () => submitEntry('Published'));
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const applyPositions = initTabs();
  initAddEntryModal();

  fetch('journal.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
      return res.json();
    })
    .then(data => {
      renderWritings(data.writings);
      renderEntries(data.entries);
      // Re-run layout after all cards are in the DOM
      applyPositions();
    })
    .catch(err => console.error('Journal data error:', err));
});