// ═══════════════════════════════════════════════════════════════════════════
//  journal.js  —  Firebase/Firestore backend  (schema-aligned)
//
//  COLLECTION: posts  (single collection for everything)
//
//  DATA SOURCES
//  ┌─ Writings folder ── posts where type == "log"    (read-only; liked via logbook)
//  └─ My Entries folder  posts where type == "entry"  (full CRUD; only current user's)
//
//  CRUD (My Entries only)
//  ┌─ Create ── "+ Add to Journal" → addDoc() to posts
//  ├─ Read ──── onSnapshot() filtered by type=="entry" + userId==currentUser
//  ├─ Update ── "Edit" button → updateDoc()
//  └─ Delete ── "Delete" button (two-tap confirm) → deleteDoc()
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '../firebase.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js';

// ─── AUTH ─────────────────────────────────────────────────────────────────────

const auth = getAuth();

// authReady resolves with the current Firebase user (or null if not signed in)
const authReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub(); // only need the first emission
    resolve(user);
  });
});

// Kick off data loading once auth is confirmed
authReady.then((user) => {
  if (!user) {
    console.warn('journal.js: no authenticated user — redirecting to login.');
    window.location.href = '../webpages/log-in.html';
    return;
  }
  subscribeEntries(user.uid);
  loadWritings(user.uid);
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// ─── MODULE STATE ─────────────────────────────────────────────────────────────

let entriesCache      = [];
let applyTabPositions = () => {};
let currentEntryId    = null;   // Firestore doc id open in view modal
let editingEntryId    = null;   // Firestore doc id being edited (null = new)
let _openFormModal    = null;

// ─── SHARED PIN-CARD RENDERER ─────────────────────────────────────────────────

function renderPinCards(containerId, items, cardMapper) {
  const row = document.getElementById(containerId);
  if (!row) return;
  row.innerHTML = items.map(item => {
    const { imgSrc, imgAlt, title, sub, snippet, dataset } = cardMapper(item);
    const attrs = Object.entries(dataset)
      .map(([k, v]) => `data-${k}="${String(v).replace(/"/g, '&quot;')}"`)
      .join(' ');
    return `
      <div class="pin-card" ${attrs}>
        <div class="pin-card-img">
          ${imgSrc ? `<img src="${imgSrc}" alt="${imgAlt || ''}">` : ''}
        </div>
        <p class="pin-card-title">${title}</p>
        <p class="pin-card-sub">${sub || ''}</p>
        <p class="pin-card-snippet">${snippet || ''}</p>
      </div>`;
  }).join('');
}

// ─── WRITINGS  (posts where type == "log" — liked posts from logbook) ─────────
//

function loadWritings(uid) {
  // No orderBy — avoids composite index requirement. Sorted client-side.
  const q = query(
    collection(db, 'posts'),
    where('type',   '==', 'log'),
    where('category', '==', 'journal'),
    where('userId', '==', uid)
  );

  onSnapshot(q,
    snap => {
      const writings = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.datePosted?.seconds ?? 0) - (a.datePosted?.seconds ?? 0));
      console.log('Writings loaded:', writings.length);
      renderWritings(writings);
    },
    err => {
      console.error('Writings query error:', err.message, err);
      renderWritings([]);
    }
  );
}

function renderWritings(writings) {
  renderPinCards('writing-pinned-row', writings, w => ({
    imgSrc:  w.imageUrl  || '',
    imgAlt:  w.title,
    title:   w.title,
    sub:     `by ${w.username || 'Unknown'}`,
    snippet: w.body ? w.body.slice(0, 100) : '',
    dataset: {
      title:    w.title,
      author:   w.username    || 'Unknown',
      label:    w.tagType     || w.category || 'Log',
      content:  w.body        || '',
      image:    w.imageUrl    || '',
    }
  }));
  bindWritingModal();
  applyTabPositions();
}

function bindWritingModal() {
  const overlay = document.getElementById('writingModalOverlay');

  function open(pin) {
    const img = document.getElementById('writingModalHeroImg');
    const ph  = document.getElementById('writingModalHeroPlaceholder');
    if (pin.dataset.image) {
      img.src = pin.dataset.image; img.style.display = 'block'; ph.style.display = 'none';
    } else {
      img.style.display = 'none'; img.src = ''; ph.style.display = 'flex';
    }
    document.getElementById('writingModalLabel').textContent   = pin.dataset.label;
    document.getElementById('writingModalTitle').textContent   = pin.dataset.title;
    document.getElementById('writingModalAuthor').textContent  = `by ${pin.dataset.author}`;
    document.getElementById('writingModalContent').textContent = pin.dataset.content;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('#writing-pinned-row .pin-card').forEach(p => {
    p.addEventListener('click', () => open(p));
  });
  document.getElementById('writingModalClose').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// ─── MY ENTRIES  (posts where type == "entry" + userId == me — real-time) ─────

function subscribeEntries(uid) {
  // No orderBy — avoids composite index requirement. Sorted client-side.
  const q = query(
    collection(db, 'posts'),
    where('type',   '==', 'entry'),
    where('userId', '==', uid)
  );

  onSnapshot(q,
    snap => {
      entriesCache = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.datePosted?.seconds ?? 0) - (a.datePosted?.seconds ?? 0));
      console.log('Entries loaded:', entriesCache.length);
      renderEntries(entriesCache);
    },
    err => {
      console.error('Entries query error:', err.message, err);
    }
  );
}

function renderEntries(entries) {
  renderPinCards('entry-card-list', entries, e => ({
    imgSrc:  e.imageUrl || '',
    imgAlt:  e.title,
    title:   e.title,
    sub:     e.activityDate || '',
    snippet: e.body || '',
    dataset: {
      id:     e.id,
      title:  e.title,
      type:   e.tagType  || 'entry001',    // tagType from schema e.g. "entry001"
      date:   e.activityDate || '',
      status: e.status   || 'Private',
      image:  e.imageUrl || '',
      body:   e.body     || '',
    }
  }));
  bindEntriesModal();
  applyTabPositions();
}

function bindEntriesModal() {
  document.querySelectorAll('#entry-card-list .pin-card').forEach(p => {
    p.addEventListener('click', () => openEntryViewModal(p));
  });
}

// ─── ENTRY VIEW MODAL ─────────────────────────────────────────────────────────

function openEntryViewModal(pin) {
  currentEntryId = pin.dataset.id;

  const img = document.getElementById('entryModalHeroImg');
  const ph  = document.getElementById('entryModalHeroPlaceholder');
  if (pin.dataset.image) {
    img.src = pin.dataset.image; img.style.display = 'block'; ph.style.display = 'none';
  } else {
    img.style.display = 'none'; img.src = ''; ph.style.display = 'flex';
  }

  document.getElementById('entryModalTitle').textContent = pin.dataset.title;
  document.getElementById('entryModalMeta').textContent  = '';
  document.getElementById('entryModalDate').textContent  = pin.dataset.date;
  document.getElementById('entryModalDesc').textContent  = pin.dataset.body;

  const badge = document.getElementById('entryModalBadge');
  badge.textContent = pin.dataset.status;
  badge.className   = `modal-badge ${pin.dataset.status.toLowerCase()}`;

  resetDeleteState();
  document.getElementById('entryModalOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEntryViewModal() {
  document.getElementById('entryModalOverlay').classList.remove('open');
  document.body.style.overflow = '';
  currentEntryId = null;
  resetDeleteState();
}

function resetDeleteState() {
  const btn = document.getElementById('entryModalDelete');
  if (!btn) return;
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:5px;vertical-align:-1px">
      <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5 5.5l.5 5M9 5.5l-.5 5M3.5 3.5l.5 8h6l.5-8"
        stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>Delete`;
  btn.dataset.confirm = '';
  btn.classList.remove('confirming');
}

// ─── ENTRY MODAL: Edit + Delete ───────────────────────────────────────────────

function initEntryModalActions() {
  const overlay = document.getElementById('entryModalOverlay');

  document.getElementById('entryModalClose').addEventListener('click', closeEntryViewModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeEntryViewModal(); });

  // ── Edit ──
  document.getElementById('entryModalEdit').addEventListener('click', () => {
    const entry = entriesCache.find(e => e.id === currentEntryId);
    if (!entry) return;
    closeEntryViewModal();
    if (_openFormModal) _openFormModal(entry);
  });

  // ── Delete (two-tap confirm) ──
  document.getElementById('entryModalDelete').addEventListener('click', function () {
    if (this.dataset.confirm === '1') {
      const idToDelete = currentEntryId;
      closeEntryViewModal();
      deleteEntry(idToDelete);
    } else {
      this.innerHTML = 'Confirm delete?';
      this.dataset.confirm = '1';
      this.classList.add('confirming');
      setTimeout(() => resetDeleteState(), 3500);
    }
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * CREATE — writes a new post (type="entry") to Firestore.
 * Also increments entryCount on the user's profile document.
 */
async function createEntry(data) {
  // Await auth resolution — fixes null-user race on first page load
  const user = await authReady;
  if (!user) {
    console.error('createEntry: no authenticated user.');
    return;
  }

  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  try {
    const docRef = await addDoc(collection(db, 'posts'), {
      // identity
      userId:             user.uid,
      username:           user.displayName || '',
      userProfilePicture: user.photoURL    || '',

      // type flags (schema)
      type:               'entry',
      tagType:            'entry001',
      category:           '',

      // content
      title:              data.title  || 'Untitled',
      body:               data.body   || '',
      imageUrl:           data.image  || '',
      status:             data.status || 'Private',

      // entry-specific defaults
      activityDate:       dateStr,
      rating:             0,
      item:               {},

      // counters & timestamps
      stampCount:         0,
      datePosted:         serverTimestamp(),
      updatedAt:          serverTimestamp(),
    });

    console.log('Entry created:', docRef.id);

    // Increment entryCount on user profile
    await updateDoc(doc(db, 'users', user.uid), {
      entryCount: increment(1),
    });
  } catch (err) {
    console.error('createEntry failed:', err.message, err);
  }
}

/**
 * UPDATE — merges changed content fields into the existing post doc.
 */
async function updateEntry(id, data) {
  try {
    await updateDoc(doc(db, 'posts', id), {
      title:     data.title  || 'Untitled',
      body:      data.body   || '',
      imageUrl:  data.image  !== undefined ? data.image : '',
      status:    data.status || 'Private',
      updatedAt: serverTimestamp(),
    });
    console.log('Entry updated:', id);
  } catch (err) {
    console.error('updateEntry failed:', err.message, err);
  }
}

async function deleteEntry(id) {
  const user = await authReady;
  if (!user) return;
  try {
    await deleteDoc(doc(db, 'posts', id));
    await updateDoc(doc(db, 'users', user.uid), {
      entryCount: increment(-1),
    });
    console.log('Entry deleted:', id);
  } catch (err) {
    console.error('deleteEntry failed:', err.message, err);
  }
}

// ─── ADD / EDIT ENTRY MODAL ───────────────────────────────────────────────────

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
  const modeTag      = document.getElementById('addEntryModeTag');
  const addBtn       = document.querySelector('.add-btn');

  let thumbnailDataUrl = '';
  let selectedType     = 'Personal';

  function setType(type) {
    selectedType = type || 'Personal';
  }

  function resetForm() {
    titleInput.value           = '';
    bodyInput.value            = '';
    thumbnailDataUrl           = '';
    thumbPreview.src           = '';
    thumbPreview.style.display = 'none';
    thumbHolder.style.display  = 'flex';
    setType('Personal');
    editingEntryId             = null;
    if (modeTag) modeTag.textContent = 'New Entry';
  }

  function openFormModal(prefill) {
    resetForm();
    if (prefill) {
      editingEntryId   = prefill.id;
      titleInput.value = prefill.title    || '';
      bodyInput.value  = prefill.body     || '';
      // tagType stored in Firestore, shown as chip selection label
      setType(prefill.tagType || prefill.type || 'Personal');
      if (prefill.imageUrl) {
        thumbnailDataUrl           = prefill.imageUrl;
        thumbPreview.src           = prefill.imageUrl;
        thumbPreview.style.display = 'block';
        thumbHolder.style.display  = 'none';
      }
      if (modeTag) modeTag.textContent = 'Edit Entry';
    }
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => titleInput.focus(), 320);
  }

  _openFormModal = openFormModal;

  function closeFormModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    editingEntryId = null;
  }

  thumbArea.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', () => {
    const file = imgInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      thumbnailDataUrl           = ev.target.result;
      thumbPreview.src           = thumbnailDataUrl;
      thumbPreview.style.display = 'block';
      thumbHolder.style.display  = 'none';
    };
    reader.readAsDataURL(file);
  });

  async function submitEntry(status) {
    const data = {
      title:  titleInput.value.trim(),
      type:   selectedType,
      status,
      image:  thumbnailDataUrl,
      body:   bodyInput.value.trim(),
    };

    // Capture before resetForm() clears editingEntryId
    const idToEdit = editingEntryId;

    closeFormModal();
    resetForm();

    if (idToEdit) {
      await updateEntry(idToEdit, data);
    } else {
      await createEntry(data);
    }
  }

  addBtn.addEventListener('click',  () => openFormModal(null));
  closeBtn.addEventListener('click', closeFormModal);
  overlay.addEventListener('click',  e => { if (e.target === overlay) closeFormModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeFormModal();
  });
  privBtn.addEventListener('click', () => submitEntry('Private'));
  postBtn.addEventListener('click', () => submitEntry('Published'));
}

// ─── TAB ACCORDION ────────────────────────────────────────────────────────────

function initTabs() {
  const tabGroups = Array.from(document.querySelectorAll('.tab-group'));
  const wrapper   = document.querySelector('.tabs-wrapper');
  const baseTops  = tabGroups.map(g => g.offsetTop);
  const OVERLAP        = 40;
  const BOTTOM_PADDING = 10;

  function getEntriesHeight(group) {
    const el = group.querySelector('.folder-entries');
    return el ? el.scrollHeight : 0;
  }
  function getTabHeaderHeight(group) {
    const el = group.querySelector('.tab-header');
    return el ? el.offsetHeight : 0;
  }

  function applyPositions() {
    let shift = 0;
    tabGroups.forEach((group, i) => {
      group.style.top = (baseTops[i] + shift) + 'px';
      const overlay = group.querySelector('.folder-overlay');
      if (group.classList.contains('open')) {
        const tabH     = getTabHeaderHeight(group);
        const entriesH = getEntriesHeight(group);
        const totalH   = tabH + entriesH + BOTTOM_PADDING;
        if (overlay) overlay.style.height = totalH + 'px';
        const slotH = i + 1 < baseTops.length ? baseTops[i + 1] - baseTops[i] : 0;
        shift += Math.max(0, totalH - slotH - OVERLAP - 300);
      } else {
        if (overlay) overlay.style.height = '';
      }
    });

    const last    = tabGroups[tabGroups.length - 1];
    const lastTop = parseFloat(last.style.top) || baseTops[tabGroups.length - 1];
    let lastH = 0;
    if (last.classList.contains('open')) {
      lastH = getTabHeaderHeight(last) + getEntriesHeight(last) + BOTTOM_PADDING - OVERLAP;
    } else {
      const h = last.querySelector('.tab-header');
      lastH = h ? h.offsetHeight : 0;
    }
    wrapper.style.height = (lastTop + lastH) + 'px';
  }

  function toggleTab(group) {
    group.classList.toggle('open');
    applyPositions();
  }

  tabGroups.forEach(group => {
    group.querySelector('.tab-header').addEventListener('click', () => toggleTab(group));

    const overlay = group.querySelector('.folder-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => toggleTab(group));
      const entries = overlay.querySelector('.folder-entries');
      if (entries) entries.addEventListener('click', e => e.stopPropagation());

      const closeBtn     = document.createElement('button');
      closeBtn.className = 'close-hint';
      closeBtn.innerHTML = '&times;';
      closeBtn.title     = 'Close';
      closeBtn.addEventListener('click', e => { e.stopPropagation(); toggleTab(group); });
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

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  applyTabPositions = initTabs();
  initAddEntryModal();
  initEntryModalActions();

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('entryModalOverlay').classList.contains('open')) {
        closeEntryViewModal();
      }
    }
  });

  // Auth-gated data loading is handled inside onAuthStateChanged above
});