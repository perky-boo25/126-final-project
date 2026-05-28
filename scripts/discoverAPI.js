// ============================================================
//  API OVERRIDES  (fixed — broad fetches, dynamic genre mapping)
//  PASTE THIS SCRIPT AT THE BOTTOM OF YOUR HTML.
//  Delete the engine initialize() calls in discoveruifx.js.
// ============================================================

// ============================================================
//  MUSIC — iTunes Search API (no key, no CORS issues)
// ============================================================
MusicEngine.initialize = async function () {
  console.log("[MUSIC] Fetching tracks from iTunes...");
  try {
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    const shuffled = [...letters].sort(() => Math.random() - 0.5);
    const searches = shuffled.slice(0, 8);

    const responses = await Promise.all(
      searches.map((term) =>
        fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=6`,
        ).then((r) => {
          if (!r.ok) throw new Error(`HTTP error: ${r.status}`);
          return r.json();
        }),
      ),
    );

    const seen = new Set();
    const allTracks = [];

    responses.forEach((data) => {
      (data.results || []).forEach((track) => {
        if (seen.has(track.trackId)) return;
        seen.add(track.trackId);

        const minutes = Math.floor(track.trackTimeMillis / 60000);
        const seconds = Math.floor((track.trackTimeMillis % 60000) / 1000)
          .toString()
          .padStart(2, "0");

        const genre = (track.primaryGenreName || "pop").toLowerCase();

        allTracks.push({
          title: track.trackName,
          subtitle: track.artistName,
          img: track.artworkUrl100.replace("100x100bb", "600x600bb"),
          genre: genre.includes("pop")
            ? "pop"
            : genre.includes("indie") || genre.includes("alternative")
            ? "indie"
            : "pop",
          liked: false,
          description: `${track.trackName} by ${track.artistName}, from the album "${track.collectionName}".`,
          meta: [
            { label: "Album", value: track.collectionName || "—" },
            { label: "Genre", value: track.primaryGenreName || "—" },
            { label: "Released", value: track.releaseDate?.slice(0, 4) || "—" },
            { label: "Duration", value: `${minutes}:${seconds}` },
          ],
          link: {
            label: "Open in iTunes",
            url: track.trackViewUrl,
          },
        });
      });
    });

    this.items = allTracks;
    this.buildCarousel();
  } catch (error) {
    console.error("[MUSIC] Failed to fetch from iTunes:", error);
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
const TMDB_API_KEY = "301a5df652724057f68fabc019706dbf"; // ← Replace with your actual TMDB key

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
  if (this._firestoreReady) return;

  console.log("[JOURNALS] Waiting for window.db...");

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
    this._firestoreReady = true;

    this.buildCarousel();

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

  if (this._firestoreReady && this.items.length > 0) {
    PaletteSheet.open(this);
    return;
  }

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
//  FIX 2 — Letters reviews: only fetch reviews scoped to
//  category="journals" so other categories don't bleed in.
//  Patches LetterPopup.open() to load Firestore reviews filtered
//  by the journal's own doc ID, not just title.
// ============================================================
const _origLetterPopupOpen = LetterPopup.open.bind(LetterPopup);

LetterPopup.open = function (item, index, instance) {
  _origLetterPopupOpen(item, index, instance);
  this._loadJournalReviews(item);
};

LetterPopup._loadJournalReviews = async function (item) {
  if (!window.db) return;

  try {
    const { collection, query, where, orderBy, limit, getDocs } =
      await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");

    const reviewsQuery = query(
      collection(window.db, "posts"),
      where("postId", "==", item.id),
      where("category", "==", "journals"),
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

    const list = document.getElementById("letter-reviews-list");
    if (list) {
      list.innerHTML = LetterPopup._renderReviews(reviews);
    }

    this._reviews[item.id] = reviews;
  } catch (err) {
    console.warn("[JOURNALS] Review load error:", err);
  }
};

// ============================================================
//  FAVORITES SYNC — users/{uid}.favorite array
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

  function getCurrentUid() {
    if (window.firebaseAuth?.currentUser?.uid)
      return window.firebaseAuth.currentUser.uid;
    if (window._auth?.currentUser?.uid) return window._auth.currentUser.uid;
    if (typeof firebase !== "undefined" && firebase.auth?.().currentUser?.uid)
      return firebase.auth().currentUser.uid;
    return null;
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
//  PATCH — PaletteCollection.toggleLike
// ============================================================
const _origToggleLike = PaletteCollection.prototype.toggleLike;

PaletteCollection.prototype.toggleLike = function (event, index) {
  _origToggleLike.call(this, event, index);

  const item = this.items[index];
  if (!item) return;

  if (item.liked) {
    FavoritesSync.addFavorite(this.type, item);
  } else {
    FavoritesSync.removeFavorite(this.type, item);
  }
};

// ============================================================
//  PATCH — LetterPopup._toggleLike
// ============================================================
const _origLetterToggleLike = LetterPopup._toggleLike.bind(LetterPopup);

LetterPopup._toggleLike = function () {
  _origLetterToggleLike();

  const item = this._activeItem;
  if (!item) return;

  if (item.liked) {
    FavoritesSync.addFavorite("letters", item);
  } else {
    FavoritesSync.removeFavorite("letters", item);
  }
};

// ============================================================
//  RESTORE LIKED HEARTS — only when a user IS logged in
// ============================================================
async function loadUserFavorites() {
  if (!window.db) return;

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

    applyFavorites();
    setTimeout(applyFavorites, 3000);
  } catch (err) {
    console.warn("[FAVORITES] loadUserFavorites error:", err);
  }
}

loadUserFavorites();
// ============================================================
//  LOGBOOK SYNC — writes a logbook entry to Firestore "posts"
//  Called by PalettePopup._addToLogbook() and
//  LetterPopup._addToLogbook() in discoveruifx.js.
// ============================================================
const LogbookSync = (() => {

  // Maps PaletteCollection type → Firestore category value
  const TYPE_CATEGORY_MAP = {
    music:   "music",
    books:   "book",
    movies:  "film",
    art:     "art",
    letters: "journal",
  };

  function getCurrentUid() {
    if (window.firebaseAuth?.currentUser?.uid)
      return window.firebaseAuth.currentUser.uid;
    if (window._auth?.currentUser?.uid)
      return window._auth.currentUser.uid;
    if (typeof firebase !== "undefined" && firebase.auth?.().currentUser?.uid)
      return firebase.auth().currentUser.uid;
    return null;
  }

  function getCurrentUsername() {
    const user =
      window.firebaseAuth?.currentUser ||
      window._auth?.currentUser ||
      (typeof firebase !== "undefined" && firebase.auth?.().currentUser);
    return user?.displayName || user?.email || "you";
  }

  function buildEntry(type, item) {
    const now = new Date();
    const activityDate = now.toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    return {
      // ── Identity ──────────────────────────────────────────
      category:    TYPE_CATEGORY_MAP[type] || type,
      status:      "Published",
      type:        "log",
      tagType:     "entry" + String(Date.now()).slice(-6), // e.g. "entry482910"

      // ── Content ───────────────────────────────────────────
      title:       item.title       || "Untitled",
      body:        item.description || "",
      imageUrl:    item.img         || "",
      username:    getCurrentUsername(),

      // ── Timestamps ────────────────────────────────────────
      activityDate,                         // "May 28, 2026"
      // datePosted filled by caller with serverTimestamp()

      // ── Stats ─────────────────────────────────────────────
      rating:      item.rating   || 0,
      stampCount:  0,

      // ── Raw fetched item stored as a single-element array ─
      item: [
        {
          id:          item.id || item.title,
          title:       item.title       || "Untitled",
          subtitle:    item.subtitle    || "",
          img:         item.img         || null,
          genre:       item.genre       || "other",
          description: item.description || "",
          meta:        item.meta        || [],
          link:        item.link        || null,
          type,
        },
      ],
    };
  }

  /**
   * Public entry point.
   * @param {string} type  - "music" | "books" | "movies" | "art" | "letters"
   * @param {object} item  - the full item object from the engine / popup config
   * @returns {string}     - new Firestore doc ID
   */
  async function addToLogbook(type, item) {
    const uid = getCurrentUid();
    if (!uid) {
      alert("Log in to add items to your logbook.");
      throw new Error("Not authenticated");
    }
    if (!window.db) throw new Error("Firestore db not ready");

    const { collection, addDoc, serverTimestamp } =
      await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");

    const entry = buildEntry(type, item);
    entry.datePosted = serverTimestamp();

    const docRef = await addDoc(collection(window.db, "posts"), entry);
    console.log(`[LOGBOOK] +added "${item.title}" (${type}) → ${docRef.id}`);
    return docRef.id;
  }

  return { addToLogbook };
})();