// ============================================================
//  API OVERRIDES  (fixed — broad fetches, dynamic genre mapping)
//  PASTE THIS SCRIPT AT THE BOTTOM OF YOUR HTML.
//  Delete the engine initialize() calls in discoveruifx.js.
// ============================================================

// ============================================================
//  MUSIC — Local songs.json (Discover/data/songs.json)
// ============================================================
MusicEngine.initialize = async function () {
  console.log("[MUSIC] Fetching tracks from local songs.json...");
  try {
    const res = await fetch(this.endpoint);
    if (!res.ok) throw new Error(`HTTP fetch error: ${res.status}`);
    this.items = await res.json();
    this.buildCarousel();
  } catch (error) {
    console.error("[MUSIC] Failed to load songs.json:", error);
  }
};

// ============================================================
//  BOOKS — Open Library
// ============================================================
BookEngine.initialize = async function () {
  const SUBJECTS = [
    "fiction",
    "science_fiction",
    "romance",
    "thriller",
    "mystery",
  ];
  const LIMIT_PER_SUBJECT = 12;

  const SUBJECT_GENRE_MAP = {
    fiction: "fiction",
    science_fiction: "scifi",
    romance: "romance",
    thriller: "thriller",
    mystery: "mystery",
  };

  try {
    const responses = await Promise.all(
      SUBJECTS.map((subject) =>
        fetch(
          `https://openlibrary.org/subjects/${subject}.json?limit=${LIMIT_PER_SUBJECT}`,
        ).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      ),
    );

    const seen = new Set();
    const allBooks = [];

    responses.forEach((data, i) => {
      const filterGenre = SUBJECT_GENRE_MAP[SUBJECTS[i]];

      (data.works || []).forEach((book) => {
        if (!book.key || seen.has(book.key)) return;
        seen.add(book.key);

        const img = book.cover_id
          ? `https://covers.openlibrary.org/b/id/${book.cover_id}-L.jpg`
          : null;

        const authors =
          (book.authors || []).map((a) => a.name).join(", ") ||
          "Unknown author";

        allBooks.push({
          title: book.title || "Untitled",
          subtitle: authors,
          img,
          genre: filterGenre,
          description:
            `Published ${book.first_publish_year || "unknown"}. ` +
            (book.subject || []).slice(0, 3).join(", "),
          meta: [
            { label: "Author", value: authors },
            { label: "Year", value: book.first_publish_year || "—" },
            {
              label: "Subjects",
              value: (book.subject || []).slice(0, 3).join(", ") || "—",
            },
          ],
          liked: false,
          rating: 0,
          link: {
            url: `https://openlibrary.org${book.key}`,
            label: "View on Open Library",
          },
        });
      });
    });

    this.items = allBooks;
    this.buildCarousel();
  } catch (err) {
    console.error("[BOOKS] API error:", err);
  }
};

// ============================================================
//  ART — Art Institute of Chicago  (broad fetch, all types)
// ============================================================
ArtEngine.initialize = async function () {
  const PAGES = 3;
  const LIMIT = 20;
  const FIELDS =
    "id,title,artist_display,date_display,medium_display," +
    "artwork_type_title,place_of_origin,image_id," +
    "style_titles,dimensions,credit_line,is_public_domain";

  const STYLE_MAP = [
    ["impressionism", "impressionism"],
    ["post-impressionism", "post-impressionism"],
    ["pointillism", "post-impressionism"],
    ["surrealism", "surrealism"],
    ["renaissance", "renaissance"],
    ["baroque", "baroque"],
    ["ukiyo-e", "ukiyo-e"],
    ["japonism", "ukiyo-e"],
  ];

  try {
    const pageResults = await Promise.all(
      Array.from({ length: PAGES }, (_, i) =>
        fetch(
          `https://api.artic.edu/api/v1/artworks?page=${i + 1}&limit=${LIMIT}&fields=${FIELDS}`,
        ).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      ),
    );

    const iiifBase =
      pageResults[0]?.config?.iiif_url || "https://www.artic.edu/iiif/2";

    const allArt = pageResults.flatMap((page) => page.data || []);

    this.items = allArt
      .filter((art) => art.image_id)
      .map((art) => {
        const img = `${iiifBase}/${art.image_id}/full/400,/0/default.jpg`;

        const [artistName = "Unknown artist", artistDetail = ""] = (
          art.artist_display || ""
        ).split("\n");

        const stylesLower = (art.style_titles || []).map((s) =>
          s.toLowerCase(),
        );
        const matched = STYLE_MAP.find(([keyword]) =>
          stylesLower.some((s) => s.includes(keyword)),
        );
        const genre = matched ? matched[1] : "other";

        return {
          title: art.title || "Untitled",
          subtitle: artistName,
          img,
          genre,
          description: [
            artistDetail,
            art.medium_display,
            art.dimensions,
            art.credit_line,
          ]
            .filter(Boolean)
            .join(" · "),
          meta: [
            { label: "Artist", value: artistName },
            { label: "Date", value: art.date_display || "—" },
            { label: "Medium", value: art.medium_display || "—" },
            { label: "Type", value: art.artwork_type_title || "—" },
            { label: "Origin", value: art.place_of_origin || "—" },
            { label: "Dimensions", value: art.dimensions || "—" },
            {
              label: "Public domain",
              value: art.is_public_domain ? "Yes" : "No",
            },
          ],
          liked: false,
          rating: 0,
          link: {
            url: `https://www.artic.edu/artworks/${art.id}`,
            label: "View at Art Institute of Chicago",
          },
        };
      });

    this.buildCarousel();
  } catch (err) {
    console.error("[ART] API error:", err);
  }
};

// ============================================================
//  FILMS — TMDB  (broad popular fetch, full genre map)
// ============================================================
const TMDB_API_KEY = ""; // ← Replace with your actual TMDB key

MovieEngine.initialize = async function () {
  if (!TMDB_API_KEY || TMDB_API_KEY === "API KEY HERE") {
    console.warn("[FILMS] No TMDB key — falling back to local movies.json.");
    try {
      const res = await fetch(this.endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.items = await res.json();
      this.buildCarousel();
    } catch (err) {
      console.error("[FILMS] Fallback to local movies.json also failed:", err);
    }
    return;
  }

  const BASE = "https://api.themoviedb.org/3";
  const PAGES = 3;
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    sort_by: "popularity.desc",
    "vote_count.gte": "100",
    language: "en-US",
  });

  const GENRE_MAP = {
    10749: "romance",
    18: "drama",
    53: "thriller",
    16: "animation",
    35: "comedy",
    28: "drama",
    12: "drama",
    14: "drama",
    27: "thriller",
    9648: "thriller",
    878: "drama",
    10752: "drama",
    37: "drama",
    80: "thriller",
    99: "drama",
    36: "drama",
    10402: "drama",
    10770: "drama",
  };

  const IMG_BASE = "https://image.tmdb.org/t/p/w500";

  try {
    const pageResults = await Promise.all(
      Array.from({ length: PAGES }, (_, i) =>
        fetch(`${BASE}/discover/movie?${params}&page=${i + 1}`).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      ),
    );

    const allMovies = pageResults.flatMap((page) => page.results || []);

    this.items = allMovies.map((film) => {
      const matchedId = (film.genre_ids || []).find((id) => GENRE_MAP[id]);
      const genre = matchedId ? GENRE_MAP[matchedId] : "drama";
      const ratingOf5 = Math.round((film.vote_average / 10) * 5 * 2) / 2;

      return {
        title: film.title || "Untitled",
        subtitle: film.release_date?.slice(0, 4) || "—",
        img: film.poster_path ? `${IMG_BASE}${film.poster_path}` : null,
        genre,
        description: film.overview || "No description available.",
        meta: [
          { label: "Release date", value: film.release_date || "—" },
          { label: "Rating", value: `${film.vote_average?.toFixed(1)}/10` },
          { label: "Votes", value: film.vote_count?.toLocaleString() || "—" },
          { label: "Popularity", value: film.popularity?.toFixed(1) || "—" },
          { label: "Language", value: film.original_language || "—" },
          { label: "TMDB ID", value: film.id?.toString() || "—" },
        ],
        liked: false,
        rating: ratingOf5,
        link: {
          url: `https://www.themoviedb.org/movie/${film.id}`,
          label: "View on TMDB",
        },
      };
    });

    this.buildCarousel();
  } catch (err) {
    console.error("[FILMS] API error:", err);
  }
};

// ============================================================
//  LETTERS & JOURNALS — Firebase Firestore
//  Fetches posts where category == "journals" AND status == "Published"
//  Completely self-contained: blocks the local letters.json call,
//  waits for window.db, populates carousel + View All sheet.
// ============================================================

const LETTERS_GENRE_MAP = {
  personal: "personal",
  observation: "observations",
  observations: "observations",
  realization: "realization",
  realizations: "realization",
  unsent: "unsent",
  hobby: "hobby",
  hobbies: "hobby",
  entry: "personal",
};

// Stamp pool for envelope cards — cycles by index
const stamps = [
  "\uD83C\uDF38",
  "\u2709\uFE0F",
  "\uD83C\uDF3F",
  "\u2601\uFE0F",
  "\uD83D\uDD4A\uFE0F",
  "\u2605",
  "\u2661",
  "\uD83C\uDF19",
];

// ── Core Firestore fetch (shared by initialize + openSheet) ──
LettersEngine._fetchFromFirestore = async function () {
  const { collection, query, where, getDocs } =
    await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");

  const q = query(
    collection(window.db, "posts"),
    where("category", "==", "journal"),
    where("status", "==", "Published"),
  );

  const snapshot = await getDocs(q);
  const journals = [];

  snapshot.forEach((doc) => {
    const data = doc.data();

    const rawType = (data.type || "personal").toLowerCase().trim();
    const genre = LETTERS_GENRE_MAP[rawType] || "personal";

    let date = "Unknown Date";
    if (data.activityDate) {
      date = data.activityDate;
    } else if (data.datePosted?.toDate) {
      date = data.datePosted.toDate().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }

    journals.push({
      id: doc.id,
      title: data.title || "Untitled",
      subtitle: data.username || "Anonymous",
      img: data.imageUrl || null,
      description: data.body || "No content.",
      excerpt: data.body ? data.body.substring(0, 120) + "\u2026" : "",
      date,
      genre,
      liked: false,
      rating: data.rating || 0,
      author: data.username || "Anonymous",
      avatar: data.userProfilePicture || null,
    });
  });

  return journals;
};

// ── Override initialize — replaces base class fetch (letters.json) ──
LettersEngine.initialize = async function () {
  // Guard: if discoveruifx.js already called this once via the base class,
  // _firestoreReady will be set — skip the duplicate call.
  if (this._firestoreReady) return;

  console.log("[JOURNALS] Waiting for window.db...");

  // Wait for Firebase db (max 8s)
  await new Promise((resolve, reject) => {
    if (window.db) return resolve();
    let elapsed = 0;
    const t = setInterval(() => {
      elapsed += 100;
      if (window.db) {
        clearInterval(t);
        resolve();
      } else if (elapsed >= 8000) {
        clearInterval(t);
        reject(new Error("db timeout"));
      }
    }, 100);
  });

  try {
    console.log("[JOURNALS] Fetching published journals from Firestore...");
    const journals = await this._fetchFromFirestore();
    console.log(`[JOURNALS] Loaded ${journals.length} published journals.`);

    this.items = journals;
    this.activeFilter = "all";
    this.searchQuery = "";
    this._firestoreReady = true; // prevent double-run

    // Build the carousel (envelope cards via patchLettersCarousel in discoveruifx.js)
    this.buildCarousel();

    // If the sheet is already open (user clicked View All before data landed),
    // re-render it now that items exist.
    const sheetOverlay = document.getElementById("palette-sheet-overlay");
    if (
      sheetOverlay &&
      sheetOverlay.style.display === "flex" &&
      PaletteSheet.activeInstance?.type === "letters"
    ) {
      PaletteSheet.renderGrid();
    }
  } catch (err) {
    console.error("[JOURNALS] Firestore fetch error:", err);
  }
};

// ── Override openSheet — shows loader while Firestore is still fetching ──
LettersEngine.openSheet = function () {
  this.activeFilter = "all";
  this.searchQuery = "";

  // If data is already loaded, open normally
  if (this._firestoreReady && this.items.length > 0) {
    PaletteSheet.open(this);
    return;
  }

  // Open the sheet immediately with a loading placeholder
  PaletteSheet.open(this);

  const container = document.getElementById("sheet-grid-container");
  if (container) {
    container.className = "letters-sheet-grid";
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px 20px;
                  font-family:'Life Savers';color:#8a6a4a;font-size:20px;letter-spacing:.05em;">
        \u2709 Loading journals\u2026
      </div>`;
  }

  // Poll until initialize() finishes, then re-render the grid
  let waited = 0;
  const poll = setInterval(() => {
    waited += 200;
    if (this._firestoreReady && this.items.length > 0) {
      clearInterval(poll);
      PaletteSheet.renderGrid();
    } else if (waited >= 12000) {
      clearInterval(poll);
      if (container) {
        container.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:60px 20px;
                      font-family:'Life Savers';color:#c97d87;font-size:16px;">
            Could not load journals. Please check your connection.
          </div>`;
      }
    }
  }, 200);
};

// ============================================================
//  BOOTSTRAP — all engines launched in parallel via Promise.allSettled
//  IMPORTANT: delete or comment out the 5 initialize() calls
//  at the very bottom of discoveruifx.js — only initAll() should boot them.
// ============================================================

function waitForDb(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (window.db) return resolve(window.db);
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += 100;
      if (window.db) {
        clearInterval(timer);
        resolve(window.db);
      } else if (elapsed >= timeout) {
        clearInterval(timer);
        reject(new Error("db timeout after " + timeout + "ms"));
      }
    }, 100);
  });
}

async function initAll() {
  const results = await Promise.allSettled([
    MusicEngine.initialize(),
    BookEngine.initialize(),
    MovieEngine.initialize(),
    ArtEngine.initialize(),
    // Letters waits for db internally now, but we still guard here
    // so the allSettled log shows the right result.
    LettersEngine.initialize(),
  ]);

  const labels = ["MUSIC", "BOOKS", "FILMS", "ART", "JOURNALS"];
  results.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[${labels[i]}] Engine failed:`, result.reason);
    } else {
      console.log(`[${labels[i]}] Engine loaded \u2713`);
    }
  });
}

initAll();

// ============================================================
//  FIX 1 — View All button: re-render grid AFTER Firestore resolves
//  Problem: PaletteSheet.open() calls renderGrid() synchronously,
//  but LettersEngine.items is still [] while Firestore is fetching.
//  Solution: patch openSheet() so it shows a loader, then re-renders
//  once buildCarousel() (called at end of initialize) signals items are ready.
// ============================================================
LettersEngine.openSheet = function () {
  // If items already loaded (e.g. user clicks View All after page settled), open normally.
  if (this.items && this.items.length > 0) {
    PaletteSheet.open(this);
    return;
  }

  // Items not ready yet — open the sheet with a loading state
  // and poll until initialize() finishes populating this.items.
  PaletteSheet.open(this); // opens modal; grid will be empty initially

  const container = document.getElementById("sheet-grid-container");
  if (container) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;
                  font-family:'Life Savers';color:#8a6a4a;font-size:18px;">
        ✉ Loading journals…
      </div>`;
  }

  // Poll every 200ms until items land (max 10s)
  let waited = 0;
  const poll = setInterval(() => {
    waited += 200;
    if (this.items && this.items.length > 0) {
      clearInterval(poll);
      PaletteSheet.renderGrid(); // re-render now that items exist
    } else if (waited >= 10000) {
      clearInterval(poll);
      if (container) {
        container.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:40px;
                      font-family:'Life Savers';color:#c97d87;font-size:16px;">
            Could not load journals. Check your connection and try again.
          </div>`;
      }
    }
  }, 200);
};

// ============================================================
//  FIX 2 — Letters reviews: only fetch reviews scoped to
//  category="journals" so other categories don't bleed in.
//  Patches LetterPopup.open() to load Firestore reviews filtered
//  by the journal's own doc ID, not just title.
// ============================================================
const _origLetterPopupOpen = LetterPopup.open.bind(LetterPopup);

LetterPopup.open = function (item, index, instance) {
  // Run the original open (builds the HTML, shows overlay)
  _origLetterPopupOpen(item, index, instance);

  // Now load reviews scoped strictly to this journal doc
  // by querying the sub-collection or by docId match.
  this._loadJournalReviews(item);
};

LetterPopup._loadJournalReviews = async function (item) {
  if (!window.db) return;

  try {
    const { collection, query, where, orderBy, limit, getDocs } =
      await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");

    // Query reviews that are:
    //   - linked to this exact journal doc by its Firestore ID
    //   - category = "journals" (prevents cross-category bleed)
    // Your groupmates store reviews as separate posts with a parentId / postId field.
    // Adjust the where() field name below to match their schema:
    //   common names: "postId", "parentId", "journalId", "entryId"
    const reviewsQuery = query(
      collection(window.db, "posts"),
      where("postId", "==", item.id), // ← links review to this journal
      where("category", "==", "journals"), // ← scopes to journals only
      orderBy("datePosted", "desc"),
      limit(30),
    );

    const snap = await getDocs(reviewsQuery);
    const reviews = [];

    snap.forEach((doc) => {
      const d = doc.data();
      reviews.push({
        user: d.username || d.user || "anonymous",
        text: d.body || d.text || "",
        rating: d.rating || 0,
      });
    });

    // Update the reviews list in the open popup
    const list = document.getElementById("letter-reviews-list");
    if (list) {
      list.innerHTML = LetterPopup._renderReviews(reviews);
    }

    // Cache so _submit() can prepend optimistically
    this._reviews[item.id] = reviews;
  } catch (err) {
    console.warn("[JOURNALS] Review load error:", err);
  }
};

// ============================================================
//  FAVORITES SYNC — users/{uid}.favorite array
//  Rules:
//    - Published journals (carousel + View All) = public, no login needed
//    - toggleLike / heart button = logged-in users only
//    - loadUserFavorites = only runs when a user IS logged in
// ============================================================

const FavoritesSync = (() => {
  function buildFavoriteEntry(type, item) {
    return {
      id: item.id || item.title,
      type,
      title: item.title || "Untitled",
      subtitle: item.subtitle || "",
      img: item.img || null,
      genre: item.genre || "all",
      likedAt: new Date().toISOString(),
    };
  }

  // Returns uid if a user is currently logged in, otherwise null (guest).
  // No waiting — synchronous snapshot of auth state.
  function getCurrentUid() {
    if (window.firebaseAuth?.currentUser?.uid)
      return window.firebaseAuth.currentUser.uid;
    if (window._auth?.currentUser?.uid) return window._auth.currentUser.uid;
    if (typeof firebase !== "undefined" && firebase.auth?.().currentUser?.uid)
      return firebase.auth().currentUser.uid;
    return null; // not logged in — guest
  }

  async function addFavorite(type, item) {
    const uid = getCurrentUid();
    if (!uid) {
      console.log("[FAVORITES] Not logged in — like is local only.");
      return;
    }
    if (!window.db) return;

    try {
      const { doc, updateDoc, arrayUnion } =
        await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
      await updateDoc(doc(window.db, "users", uid), {
        favorite: arrayUnion(buildFavoriteEntry(type, item)),
      });
      console.log(`[FAVORITES] +liked "${item.title}" (${type})`);
    } catch (err) {
      console.warn("[FAVORITES] addFavorite error:", err);
    }
  }

  async function removeFavorite(type, item) {
    const uid = getCurrentUid();
    if (!uid) {
      console.log("[FAVORITES] Not logged in — unlike is local only.");
      return;
    }
    if (!window.db) return;

    try {
      const { doc, getDoc, updateDoc } =
        await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
      const userRef = doc(window.db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return;

      const itemId = item.id || item.title;
      const updated = (userSnap.data().favorite || []).filter(
        (f) => !(f.id === itemId && f.type === type),
      );
      await updateDoc(userRef, { favorite: updated });
      console.log(`[FAVORITES] -unliked "${item.title}" (${type})`);
    } catch (err) {
      console.warn("[FAVORITES] removeFavorite error:", err);
    }
  }

  return { addFavorite, removeFavorite, getCurrentUid };
})();

// ============================================================
//  PATCH — PaletteCollection.toggleLike (music, books, movies, art)
//  Heart button works for everyone UI-wise; Firestore sync only
//  fires when a user is logged in.
// ============================================================
const _origToggleLike = PaletteCollection.prototype.toggleLike;

PaletteCollection.prototype.toggleLike = function (event, index) {
  _origToggleLike.call(this, event, index);

  const item = this.items[index];
  if (!item) return;

  // Firestore sync — silently skipped if not logged in
  if (item.liked) {
    FavoritesSync.addFavorite(this.type, item);
  } else {
    FavoritesSync.removeFavorite(this.type, item);
  }
};

// ============================================================
//  PATCH — LetterPopup._toggleLike (letters / journals)
// ============================================================
const _origLetterToggleLike = LetterPopup._toggleLike.bind(LetterPopup);

LetterPopup._toggleLike = function () {
  _origLetterToggleLike();

  const item = this._activeItem;
  if (!item) return;

  // Firestore sync — silently skipped if not logged in
  if (item.liked) {
    FavoritesSync.addFavorite("letters", item);
  } else {
    FavoritesSync.removeFavorite("letters", item);
  }
};

// ============================================================
//  RESTORE LIKED HEARTS — only when a user IS logged in
//  Reads users/{uid}.favorite and marks matching engine items
//  as liked so hearts are filled on page load.
//  Guests see all cards with hearts unfilled — no fetch needed.
// ============================================================
async function loadUserFavorites() {
  if (!window.db) return;

  // Snapshot check — no polling, no waiting.
  // Journals are public; only the heart state is user-specific.
  const uid = FavoritesSync.getCurrentUid();

  if (!uid) {
    console.log("[FAVORITES] Guest view — hearts start unfilled.");
    return;
  }

  try {
    const { doc, getDoc } =
      await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");

    const userSnap = await getDoc(doc(window.db, "users", uid));
    if (!userSnap.exists()) return;

    const favorites = userSnap.data().favorite || [];
    if (!favorites.length) return;

    console.log(
      `[FAVORITES] Restoring ${favorites.length} liked items for uid ${uid}.`,
    );

    const likedSet = new Set(favorites.map((f) => `${f.type}::${f.id}`));

    function applyFavorites() {
      Object.values(PaletteCollection.instances).forEach((inst) => {
        let changed = false;
        inst.items.forEach((item) => {
          const key = `${inst.type}::${item.id || item.title}`;
          if (likedSet.has(key) && !item.liked) {
            item.liked = true;
            changed = true;
          }
        });
        if (changed) inst.buildCarousel();
      });
    }

    // Apply immediately for engines already loaded,
    // then once more after 3s to catch slower engines (Firestore / APIs).
    applyFavorites();
    setTimeout(applyFavorites, 3000);
  } catch (err) {
    console.warn("[FAVORITES] loadUserFavorites error:", err);
  }
}

loadUserFavorites();
