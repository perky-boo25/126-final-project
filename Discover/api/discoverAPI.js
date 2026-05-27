// ============================================================
//  API OVERRIDES — fully client-side, no server needed
//  Keys are read from config.js (loaded before this script).
//  Copy config.example.js → config.js and fill in your keys.
// ============================================================

// ── Read keys from config.js ─────────────────────────────────
// config.js sets window.PaletteConfig before this script runs.
// If it's missing, engines log a warning and skip gracefully.
const _cfg = window.PaletteConfig || {};

const SPOTIFY_CLIENT_ID = _cfg.spotify?.clientId || "";
const SPOTIFY_CLIENT_SECRET = _cfg.spotify?.clientSecret || "";
const TMDB_API_KEY = _cfg.tmdb?.apiKey || "";

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.warn(
    "[Palette] Spotify keys missing — music will not load. Fill in config.js.",
  );
}
if (!TMDB_API_KEY) {
  console.warn(
    "[Palette] TMDB key missing — movies will not load. Fill in config.js.",
  );
}

// ── helpers ──────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function msToMinSec(ms) {
  const min = Math.floor(ms / 60000);
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${min}:${sec}`;
}

async function getSpotifyToken() {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    throw new Error("Spotify credentials not set in config.js");
  }
  const auth = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description);
  return data.access_token;
}

// ============================================================
//  MUSIC — Spotify
// ============================================================

MusicEngine.initialize = async function () {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    console.warn("[MUSIC] Skipping — no Spotify credentials in config.js.");
    return;
  }

  const QUERIES = [
    { q: "genre:pop", genre: "pop" },
    { q: "genre:synth-pop", genre: "pop" },
    { q: "genre:dance-pop", genre: "pop" },
    { q: "genre:indie", genre: "indie" },
    { q: "genre:indie-pop", genre: "indie" },
    { q: "genre:indie-rock", genre: "indie" },
    { q: "genre:r-n-b", genre: "rnb" },
    { q: "genre:soul", genre: "rnb" },
    { q: "genre:neo-soul", genre: "rnb" },
    { q: "genre:hip-hop", genre: "hiphop" },
    { q: "genre:rap", genre: "hiphop" },
    { q: "genre:trap", genre: "hiphop" },
    { q: "genre:rock", genre: "rock" },
    { q: "genre:alt-rock", genre: "rock" },
    { q: "genre:pop-rock", genre: "rock" },
  ];

  const genres = ["pop", "indie", "rnb", "hiphop", "rock"];
  const picked = genres.map((genre) => {
    const pool = QUERIES.filter((q) => q.genre === genre);
    return pool[Math.floor(Math.random() * pool.length)];
  });

  try {
    const accessToken = await getSpotifyToken();

    const results = await Promise.all(
      picked.map(({ q, genre }) =>
        fetch(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
          .then((r) => r.json())
          .then((data) => {
            if (!data.tracks) {
              console.error(`[MUSIC] Bad response for "${q}":`, data);
              return [];
            }
            return data.tracks.items.map((track) => ({
              id: track.id,
              title: track.name,
              subtitle: track.artists.map((a) => a.name).join(", "),
              img: track.album.images?.[0]?.url || "",
              genre,
              liked: false,
              rating: 0,
              description: `${track.artists.map((a) => a.name).join(", ")} — ${track.album.name}`,
              meta: [
                { label: "Album", value: track.album.name },
                { label: "Released", value: track.album.release_date },
                { label: "Duration", value: msToMinSec(track.duration_ms) },
              ],
              link: {
                label: "Open in Spotify",
                url: track.external_urls.spotify,
              },
            }));
          })
          .catch((err) => {
            console.error(`[MUSIC] Fetch error for "${q}":`, err);
            return [];
          }),
      ),
    );

    this.items = shuffle(results.flat());
    this.buildCarousel();

    if (window.PaletteDB) {
      window.PaletteDB.prefetchItems("music", this.items).then(() =>
        this.buildCarousel(),
      );
    }
  } catch (err) {
    console.error("[MUSIC] API error:", err);
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

    if (window.PaletteDB) {
      window.PaletteDB.prefetchItems("books", this.items).then(() =>
        this.buildCarousel(),
      );
    }
  } catch (err) {
    console.error("[BOOKS] API error:", err);
  }
};

// ============================================================
//  ART — Art Institute of Chicago
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
        const matched = STYLE_MAP.find(([kw]) =>
          stylesLower.some((s) => s.includes(kw)),
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

    if (window.PaletteDB) {
      window.PaletteDB.prefetchItems("art", this.items).then(() =>
        this.buildCarousel(),
      );
    }
  } catch (err) {
    console.error("[ART] API error:", err);
  }
};

// ============================================================
//  FILMS — TMDB
// ============================================================

MovieEngine.initialize = async function () {
  if (!TMDB_API_KEY) {
    console.warn("[FILMS] Skipping — no TMDB key in config.js.");
    return;
  }

  const BASE = "https://api.themoviedb.org/3";
  const PAGES = 3;
  const IMG_BASE = "https://image.tmdb.org/t/p/w500";

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

  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    sort_by: "popularity.desc",
    "vote_count.gte": "100",
    language: "en-US",
  });

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
          { label: "Language", value: film.original_language },
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

    if (window.PaletteDB) {
      window.PaletteDB.prefetchItems("movies", this.items).then(() =>
        this.buildCarousel(),
      );
    }
  } catch (err) {
    console.error("[FILMS] API error:", err);
  }
};

// ============================================================
//  BOOTSTRAP
// ============================================================

MusicEngine.initialize(); // ← Spotify       (needs config.js)
BookEngine.initialize(); // ← Open Library  (no key needed)
MovieEngine.initialize(); // ← TMDB          (needs config.js)
ArtEngine.initialize(); // ← Art Institute (no key needed)
LettersEngine.initialize(); // ← local letters.json
