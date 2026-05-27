// ─── HELPERS ────────────────────────────────────────────────────────────────

function starsHTML(count, max = 5) {
  return '★'.repeat(count) + '☆'.repeat(max - count);
}

function formatAddedDate(ts) {
  if (!ts) return '';
  let date;
  if (ts?.toDate) {
    date = ts.toDate();
  } else if (ts instanceof Date) {
    date = ts;
  } else {
    return '';
  }
  return 'Added ' + date.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric'
  });
}

// ─── RENDERERS ──────────────────────────────────────────────────────────────

function renderMusic(tracks) {
  const list = document.getElementById('music-card-list');
  list.innerHTML = tracks.map(t => `
    <div class="music-card" data-id="${t.id}">
      <div class="music-card-thumb"></div>
      <div class="music-card-body">
        <p class="music-card-title">${t.title} <span class="music-card-year">${t.year}</span></p>
        <p class="music-card-artist">By ${t.artist}</p>
        <div class="music-card-stars">${starsHTML(t.stars)}</div>
        <p class="music-card-desc">${t.desc}</p>
        ${t.addedDate ? `<p class="music-card-added">${t.addedDate}</p>` : ''}
      </div>
      <button class="card-delete-btn" title="Remove from logbook" onclick="deleteLogEntry('${t.id}', this)">🗑</button>
    </div>
  `).join('');
}

function renderFilms(films) {
  const list = document.getElementById('film-card-list');
  list.innerHTML = films.map(f => `
    <div class="film-card" data-id="${f.id}">
      <div class="film-card-thumb"></div>
      <div class="film-card-body">
        <div class="film-card-header">
          <p class="film-card-title">${f.title}</p>
          <div class="film-card-stars">${starsHTML(f.stars)}</div>
        </div>
        <p class="film-card-director">By ${f.director} <span class="film-release-year">${f.year}</span></p>
        <div class="film-card-genres">
          ${f.genres.map(g => `<span class="film-genre-tag">${g}</span>`).join('')}
        </div>
        <p class="film-card-desc">${f.desc}</p>
        ${f.addedDate ? `<p class="film-card-date">${f.addedDate}</p>` : ''}
      </div>
      <button class="card-delete-btn" title="Remove from logbook" onclick="deleteLogEntry('${f.id}', this)">🗑</button>
    </div>
  `).join('');
}

function renderBooks(books) {
  const list = document.getElementById('book-card-list');
  list.innerHTML = books.map(b => `
    <div class="book-card" data-id="${b.id}">
      <div class="book-card-thumb"></div>
      <div class="book-card-body">
        <p class="book-card-title">${b.title}</p>
        <p class="book-card-author">By ${b.author} <span class="book-card-year">${b.year}</span></p>
        <div class="book-card-stars">${starsHTML(b.stars)}</div>
        <div class="book-card-genres">
          ${b.genres.map(g => `<span class="book-genre-tag">${g}</span>`).join('')}
        </div>
        <p class="book-card-desc">${b.desc}</p>
        ${b.addedDate ? `<p class="book-card-date">${b.addedDate}</p>` : ''}
      </div>
      <button class="card-delete-btn" title="Remove from logbook" onclick="deleteLogEntry('${b.id}', this)">🗑</button>
    </div>
  `).join('');
}

function renderArt(artItems) {
  const masonry = document.getElementById('art-masonry');
  masonry.innerHTML = artItems.map(a => `
    <div class="art-pin"
      data-id="${a.id}"
      data-title="${a.title}"
      data-artist="${a.artist}"
      data-stars="${a.stars}"
      data-review="${a.review}"
      data-tags="${a.tags.join(',')}"
      data-added="${a.addedDate || ''}">
      <img src="${a.image}" alt="${a.title}">
      <div class="art-pin-overlay"></div>
      <button class="card-delete-btn art-delete-btn" title="Remove from logbook" onclick="deleteLogEntry('${a.id}', this)">🗑</button>
    </div>
  `).join('');

  initArtModal();
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

async function deleteLogEntry(docId, btn) {
  if (!docId) return;

  const confirmed = confirm('Remove this entry from your logbook?');
  if (!confirmed) return;

  // Disable button while deleting
  btn.disabled = true;
  btn.textContent = '…';

  try {
    const { deleteDoc, doc } = await import(
      'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js'
    );

    await deleteDoc(doc(window._logbookDb, 'posts', docId));

    // Animate card out then remove it
    const card = btn.closest('[data-id]');
    if (card) {
      card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.92)';
      setTimeout(() => card.remove(), 320);
    }
  } catch (err) {
    console.error('Delete failed:', err);
    btn.disabled = false;
    btn.textContent = '🗑';
    alert('Could not delete entry. Please try again.');
  }
}

// ─── ART MODAL ──────────────────────────────────────────────────────────────

function initArtModal() {
  const overlay     = document.getElementById('artModalOverlay');
  const modalImg    = document.getElementById('artModalImg');
  const modalTitle  = document.getElementById('artModalTitle');
  const modalArtist = document.getElementById('artModalArtist');
  const modalStars  = document.getElementById('artModalStars');
  const modalTags   = document.getElementById('artModalTags');
  const modalReview = document.getElementById('artModalReview');
  const modalAdded  = document.getElementById('artModalAdded');

  function openModal(pin) {
    const img   = pin.querySelector('img');
    const stars = parseInt(pin.dataset.stars, 10);
    const tags  = pin.dataset.tags.split(',');

    modalImg.src            = img ? img.src : '';
    modalImg.alt            = pin.dataset.title;
    modalTitle.textContent  = pin.dataset.title;
    modalArtist.textContent = pin.dataset.artist;
    modalStars.textContent  = starsHTML(stars);
    modalReview.textContent = pin.dataset.review;
    if (modalAdded) modalAdded.textContent = pin.dataset.added || '';

    modalTags.innerHTML = '';
    tags.forEach(tag => {
      const span = document.createElement('span');
      span.className   = 'art-modal-tag';
      span.textContent = tag.trim();
      modalTags.appendChild(span);
    });

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.art-pin').forEach(pin => {
    pin.addEventListener('click', e => {
      // Don't open modal when clicking the delete button
      if (e.target.closest('.card-delete-btn')) return;
      openModal(pin);
    });
  });

  document.getElementById('artModalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// ─── TAB ACCORDION ──────────────────────────────────────────────────────────

function initTabs() {
  const tabGroups = Array.from(document.querySelectorAll('.tab-group'));
  const wrapper   = document.querySelector('.tabs-wrapper');

  const baseTops = tabGroups.map(g => g.offsetTop);

  const OVERLAP = 60;
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
        const totalH   = tabH + entriesH + BOTTOM_PADDING;

        if (overlay) overlay.style.height = totalH + 'px';

        const slotHeight = i + 1 < baseTops.length
          ? baseTops[i + 1] - baseTops[i]
          : 0;

        cumulativeShift += Math.max(0, totalH - slotHeight - OVERLAP - 200);
      } else {
        if (overlay) overlay.style.height = '';
      }
    });

    const last    = tabGroups[tabGroups.length - 1];
    const lastTop = parseFloat(last.style.top) || baseTops[tabGroups.length - 1];
    let lastH = 0;
    if (last.classList.contains('open')) {
      lastH = getTabHeaderHeight(last) + getEntriesHeight(last) + BOTTOM_PADDING - OVERLAP;
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

// ─── FIREBASE FETCH ──────────────────────────────────────────────────────────

async function fetchLogbookData(db) {
  const { collection, query, where, getDocs } = await import(
    'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js'
  );

  const q = query(
    collection(db, 'posts'),
    where('type', '==', 'log')
  );

  const snapshot = await getDocs(q);

  const grouped = { music: [], films: [], books: [], art: [] };

  snapshot.forEach(docSnap => {
    const p = docSnap.data();
    const id       = docSnap.id;
    const cat      = (p.category || '').toLowerCase();
    const item     = p.item || {};
    const creator  = item.creator || '';
    const imageUrl = item.imageUrl || p.imageUrl || '';

    let year = '';
    if (p.activityDate) {
      const match = String(p.activityDate).match(/\d{4}/);
      if (match) year = match[0];
    } else if (p.datePosted?.toDate) {
      year = p.datePosted.toDate().getFullYear().toString();
    }

    const addedDate = formatAddedDate(p.datePosted);

    if (cat === 'music' || cat === 'album') {
      grouped.music.push({
        id, title: p.title || item.title || '', artist: creator,
        year, stars: p.rating || 0, desc: p.body || '',
        image: imageUrl, addedDate,
      });

    } else if (cat === 'film') {
      grouped.films.push({
        id, title: p.title || item.title || '', director: creator,
        year, stars: p.rating || 0, genres: p.genres || [],
        desc: p.body || '', watchedDate: p.activityDate || '',
        image: imageUrl, addedDate,
      });

    } else if (cat === 'book') {
      grouped.books.push({
        id, title: p.title || item.title || '', author: creator,
        year, stars: p.rating || 0, genres: p.genres || [],
        desc: p.body || '', readDate: p.activityDate || '',
        image: imageUrl, addedDate,
      });

    } else if (cat === 'art') {
      grouped.art.push({
        id, title: p.title || item.title || '', artist: creator,
        stars: p.rating || 0, review: p.body || '',
        tags: p.tags || [], image: imageUrl, addedDate,
      });
    }
  });

  return grouped;
}

// ─── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const applyPositions = initTabs();

  try {
    const { initializeApp } = await import(
      'https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js'
    );
    const { getFirestore } = await import(
      'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js'
    );

    const firebaseConfig = {
      apiKey:            'AIzaSyD-UrouBNyAknf6JXlh2guSG64AslirDrA',
      authDomain:        'palette-cmsc126.firebaseapp.com',
      projectId:         'palette-cmsc126',
      storageBucket:     'palette-cmsc126.firebasestorage.app',
      messagingSenderId: '215920491803',
      appId:             '1:215920491803:web:b503ee8f38f493a70967be',
      measurementId:     'G-WKGQLNCP1X',
    };

    const app = initializeApp(firebaseConfig);
    const db  = getFirestore(app);

    // Expose db globally so deleteLogEntry can access it
    window._logbookDb = db;

    const data = await fetchLogbookData(db);

    renderMusic(data.music);
    renderFilms(data.films);
    renderBooks(data.books);
    renderArt(data.art);

    applyPositions();

  } catch (err) {
    console.error('Logbook Firebase error:', err);
  }
});