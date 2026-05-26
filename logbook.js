// ─── HELPERS ────────────────────────────────────────────────────────────────

function starsHTML(count, max = 5) {
  return '★'.repeat(count) + '☆'.repeat(max - count);
}

// ─── RENDERERS ──────────────────────────────────────────────────────────────

function renderMusic(tracks) {
  const list = document.getElementById('music-card-list');
  list.innerHTML = tracks.map(t => `
    <div class="music-card">
      <div class="music-card-thumb">
        <span class="music-card-play">&#9654;</span>
      </div>
      <div class="music-card-body">
        <p class="music-card-title">${t.title} <span class="music-card-year">${t.year}</span></p>
        <p class="music-card-artist">By ${t.artist}</p>
        <div class="music-card-stars">${starsHTML(t.stars)}</div>
        <p class="music-card-desc">${t.desc}</p>
      </div>
    </div>
  `).join('');
}

function renderFilms(films) {
  const list = document.getElementById('film-card-list');
  list.innerHTML = films.map(f => `
    <div class="film-card">
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
        <p class="film-card-date">Watched ${f.watchedDate}</p>
      </div>
    </div>
  `).join('');
}

function renderBooks(books) {
  const list = document.getElementById('book-card-list');
  list.innerHTML = books.map(b => `
    <div class="book-card">
      <div class="book-card-thumb"></div>
      <div class="book-card-body">
        <p class="book-card-title">${b.title}</p>
        <p class="book-card-author">By ${b.author} <span class="book-card-year">${b.year}</span></p>
        <div class="book-card-stars">${starsHTML(b.stars)}</div>
        <div class="book-card-genres">
          ${b.genres.map(g => `<span class="book-genre-tag">${g}</span>`).join('')}
        </div>
        <p class="book-card-desc">${b.desc}</p>
        <p class="book-card-date">Read ${b.readDate}</p>
      </div>
    </div>
  `).join('');
}

function renderArt(artItems) {
  const masonry = document.getElementById('art-masonry');
  masonry.innerHTML = artItems.map(a => `
    <div class="art-pin"
      data-title="${a.title}"
      data-artist="${a.artist}"
      data-stars="${a.stars}"
      data-review="${a.review}"
      data-tags="${a.tags.join(',')}">
      <img src="${a.image}" alt="${a.title}">
      <div class="art-pin-overlay"></div>
    </div>
  `).join('');

  // Re-attach art modal listeners after rendering
  initArtModal();
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
    pin.addEventListener('click', () => openModal(pin));
  });

  document.getElementById('artModalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// ─── TAB ACCORDION ──────────────────────────────────────────────────────────

function initTabs() {
  const tabGroups  = Array.from(document.querySelectorAll('.tab-group'));
  const wrapper    = document.querySelector('.tabs-wrapper');
  const BASE_HEIGHT = 600;

  const baseTops = tabGroups.map(g => g.offsetTop);

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

// ─── INIT ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Tab accordion runs immediately — it only needs the tab-group shells in the HTML.
  initTabs();

  // Fetch data separately; cards render async without blocking tab behaviour.
  fetch('logs.json')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load data: ${res.status}`);
      return res.json();
    })
    .then(data => {
      renderMusic(data.music);
      renderFilms(data.films);
      renderBooks(data.books);
      renderArt(data.art);   // also calls initArtModal() internally
    })
    .catch(err => console.error('Logbook data error:', err));
});