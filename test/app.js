// ============================================================
//  API EXPLORER — app.js
//  Three APIs demonstrated:
//    1. Open Library   — no key, completely free
//    2. Art Institute  — no key, completely free
//    3. OMDB           — free key (1000 req/day)
//
//  For each API you'll see:
//    - the exact URL/endpoint used
//    - how a key is (or isn't) passed
//    - what the raw response shape looks like
//    - which fields are extracted and how
// ============================================================


// ── TAB HELPER ──────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.style.display = 'none');
  document.getElementById('tab-' + name).style.display = 'block';
}


// ============================================================
//  1. BOOKS — OPEN LIBRARY
//  Docs:    https://openlibrary.org/developers/api
//  No key needed. Just fetch and go.
// ============================================================

async function searchBooks() {
  const query = document.getElementById('books-input').value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById('books-results');
  resultsDiv.innerHTML = '<p class="loading">Fetching…</p>';

  // ── ENDPOINT ──────────────────────────────────────────────
  // No API key — just pass the query as a URL param.
  // `fields` lets you request only the fields you need (saves bandwidth).
  const url = `https://openlibrary.org/search.json`
    + `?q=${encodeURIComponent(query)}`   // search term
    + `&limit=10`                          // max results
    + `&fields=key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median`;

  try {
    const response = await fetch(url);
    const data     = await response.json();

    // ── RAW RESPONSE SHAPE ─────────────────────────────────
    // {
    //   numFound: 12345,
    //   start: 0,
    //   docs: [
    //     {
    //       key:                      "/works/OL45804W",
    //       title:                    "Fantastic Mr Fox",
    //       author_name:              ["Roald Dahl"],
    //       first_publish_year:       1970,
    //       cover_i:                  8739161,      // use to build cover image URL
    //       subject:                  ["Fiction", "Animals"],
    //       number_of_pages_median:   96
    //     },
    //     ...
    //   ]
    // }

    if (!data.docs || data.docs.length === 0) {
      resultsDiv.innerHTML = '<p>No results found.</p>';
      return;
    }

    // ── EXTRACT FIELDS ─────────────────────────────────────
    const cards = data.docs.map(book => {

      // Cover image: build URL from cover_i (numeric ID)
      // Sizes: S (small), M (medium), L (large)
      const coverUrl = book.cover_i
        ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
        : null;

      const title   = book.title                    ?? 'Unknown title';
      const authors = (book.author_name ?? []).join(', ') || 'Unknown author';
      const year    = book.first_publish_year       ?? '—';
      const pages   = book.number_of_pages_median   ?? '—';
      const subject = (book.subject ?? []).slice(0, 3).join(', ') || '—';

      return `
        <div class="result-card">
          ${coverUrl ? `<img src="${coverUrl}" alt="cover" />` : ''}
          <div class="info">
            <strong>${title}</strong>
            Author(s): ${authors}<br/>
            First published: ${year}<br/>
            Pages (median): ${pages}<br/>
            Subjects: ${subject}<br/>
            OL key: ${book.key}
          </div>
          <div class="clear"></div>
        </div>`;
    }).join('');

    // Also dump raw JSON so you can see every available field
    resultsDiv.innerHTML = cards
      + `<details><summary style="cursor:pointer;font-size:12px;margin-top:12px">▶ Raw JSON response</summary>`
      + `<pre class="raw-dump">${JSON.stringify(data, null, 2)}</pre></details>`;

  } catch (err) {
    resultsDiv.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}


// ============================================================
//  2. ART — ART INSTITUTE OF CHICAGO
//  Docs:    https://api.artic.edu/docs/
//  No key needed. Uses IIIF for image delivery.
// ============================================================

async function searchArt() {
  const query = document.getElementById('art-input').value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById('art-results');
  resultsDiv.innerHTML = '<p class="loading">Fetching…</p>';

  // ── ENDPOINT ──────────────────────────────────────────────
  // No API key needed.
  // `fields` param controls which fields are returned.
  const url = `https://api.artic.edu/api/v1/artworks/search`
    + `?q=${encodeURIComponent(query)}`
    + `&limit=10`
    + `&fields=id,title,artist_display,date_display,medium_display,`
    +          `artwork_type_title,place_of_origin,image_id,`
    +          `dimensions,credit_line,is_public_domain`;

  try {
    const response = await fetch(url);
    const data     = await response.json();

    // ── RAW RESPONSE SHAPE ─────────────────────────────────
    // {
    //   data: [
    //     {
    //       id:                 27992,
    //       title:              "A Sunday on La Grande Jatte",
    //       artist_display:     "Georges Seurat\nFrench, 1859–1891",
    //       date_display:       "1884–86",
    //       medium_display:     "Oil on canvas",
    //       artwork_type_title: "Painting",
    //       place_of_origin:    "France",
    //       image_id:           "2d484387-2509-5e8e-2c43-22f9981972eb",  // used for IIIF image
    //       dimensions:         "207.5 × 308.1 cm",
    //       credit_line:        "Helen Birch Bartlett Memorial Collection",
    //       is_public_domain:   true
    //     },
    //     ...
    //   ],
    //   config: {
    //     iiif_url: "https://www.artic.edu/iiif/2"  // base URL for images
    //   }
    // }

    if (!data.data || data.data.length === 0) {
      resultsDiv.innerHTML = '<p>No results found.</p>';
      return;
    }

    // ── BUILD IMAGE URL (IIIF standard) ────────────────────
    // Format: {iiif_url}/{image_id}/full/{size}/0/default.jpg
    // Size options: 200,  400,  843,  full
    // The API response includes the iiif_url in data.config.iiif_url
    const iiifBase = data.config?.iiif_url ?? 'https://www.artic.edu/iiif/2';

    const cards = data.data.map(art => {
      const imageUrl = art.image_id
        ? `${iiifBase}/${art.image_id}/full/200,/0/default.jpg`
        : null;

      // artist_display can be multiline — first line is the name
      const artistName = (art.artist_display ?? '').split('\n')[0] || 'Unknown artist';

      return `
        <div class="result-card">
          ${imageUrl ? `<img src="${imageUrl}" alt="artwork" />` : ''}
          <div class="info">
            <strong>${art.title}</strong>
            Artist: ${artistName}<br/>
            Date: ${art.date_display ?? '—'}<br/>
            Type: ${art.artwork_type_title ?? '—'}<br/>
            Medium: ${art.medium_display ?? '—'}<br/>
            Origin: ${art.place_of_origin ?? '—'}<br/>
            Dimensions: ${art.dimensions ?? '—'}<br/>
            Public domain: ${art.is_public_domain ? 'Yes' : 'No'}<br/>
            Credit: ${art.credit_line ?? '—'}
          </div>
          <div class="clear"></div>
        </div>`;
    }).join('');

    resultsDiv.innerHTML = cards
      + `<details><summary style="cursor:pointer;font-size:12px;margin-top:12px">▶ Raw JSON response</summary>`
      + `<pre class="raw-dump">${JSON.stringify(data, null, 2)}</pre></details>`;

  } catch (err) {
    resultsDiv.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}


// ============================================================
//  3. FILMS — OMDB API (wraps IMDb data)
//  Docs:    https://www.omdbapi.com/
//  Free key (1000 req/day): https://www.omdbapi.com/apikey.aspx
//
//  Two endpoints used:
//    - Search:  ?s=QUERY            → list of matching films
//    - Detail:  ?i=IMDB_ID&plot=short → full data for one film
// ============================================================

async function searchFilms() {
  const query  = document.getElementById('films-input').value.trim();
  const apiKey = document.getElementById('omdb-key').value.trim();

  if (!apiKey) {
    document.getElementById('films-results').innerHTML =
      '<p class="error">Enter your OMDB API key above first.</p>';
    return;
  }
  if (!query) return;

  const resultsDiv = document.getElementById('films-results');
  resultsDiv.innerHTML = '<p class="loading">Fetching…</p>';

  // ── ENDPOINT 1: SEARCH (returns brief list) ───────────────
  // Key is passed as a query param: ?apikey=YOUR_KEY
  // &s  = search by title
  // &type = movie | series | episode  (optional filter)
  const searchUrl = `https://www.omdbapi.com/`
    + `?apikey=${apiKey}`
    + `&s=${encodeURIComponent(query)}`
    + `&type=movie`;

  // ── RAW SEARCH RESPONSE SHAPE ──────────────────────────────
  // {
  //   Response: "True",
  //   totalResults: "47",
  //   Search: [
  //     {
  //       Title:    "Blade Runner",
  //       Year:     "1982",
  //       imdbID:   "tt0083658",   // unique IMDb ID — use for detail fetch
  //       Type:     "movie",
  //       Poster:   "https://m.media-amazon.com/images/..."
  //     },
  //     ...
  //   ]
  // }
  //
  // On error: { Response: "False", Error: "Movie not found!" }

  try {
    const searchRes  = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.Response === 'False') {
      resultsDiv.innerHTML = `<p class="error">OMDB error: ${searchData.Error}</p>`;
      return;
    }

    // ── ENDPOINT 2: DETAIL (per film, by imdbID) ───────────
    // &i    = imdbID
    // &plot = short | full
    // Returns many more fields than the search endpoint
    const detailPromises = searchData.Search.slice(0, 5).map(film =>
      fetch(`https://www.omdbapi.com/?apikey=${apiKey}&i=${film.imdbID}&plot=short`)
        .then(r => r.json())
    );

    const details = await Promise.all(detailPromises);

    // ── RAW DETAIL RESPONSE SHAPE ──────────────────────────
    // {
    //   Title:      "Blade Runner",
    //   Year:       "1982",
    //   Rated:      "R",
    //   Released:   "25 Jun 1982",
    //   Runtime:    "117 min",
    //   Genre:      "Action, Drama, Sci-Fi",
    //   Director:   "Ridley Scott",
    //   Writer:     "Hampton Fancher, David Peoples, Philip K. Dick",
    //   Actors:     "Harrison Ford, Rutger Hauer, Sean Young",
    //   Plot:       "A blade runner must pursue…",
    //   Language:   "English, German, Cantonese, Japanese, Hungarian, Arabic",
    //   Country:    "United States, Hong Kong",
    //   Awards:     "Nominated for 2 Oscars…",
    //   Poster:     "https://m.media-amazon.com/images/...",
    //   Ratings: [
    //     { Source: "Internet Movie Database", Value: "8.1/10" },
    //     { Source: "Rotten Tomatoes",         Value: "89%"    },
    //     { Source: "Metacritic",               Value: "84/100" }
    //   ],
    //   Metascore:  "84",
    //   imdbRating: "8.1",
    //   imdbVotes:  "800,000",
    //   imdbID:     "tt0083658",
    //   Type:       "movie",
    //   DVD:        "N/A",
    //   BoxOffice:  "$32,914,489",
    //   Production: "N/A",
    //   Website:    "N/A",
    //   Response:   "True"
    // }

    const cards = details.map(film => {
      if (film.Response === 'False') return '';

      // Ratings is an array of { Source, Value } objects
      const ratingsText = (film.Ratings ?? [])
        .map(r => `${r.Source}: ${r.Value}`)
        .join(' | ') || '—';

      return `
        <div class="result-card">
          ${film.Poster && film.Poster !== 'N/A' ? `<img src="${film.Poster}" alt="poster" />` : ''}
          <div class="info">
            <strong>${film.Title} (${film.Year})</strong>
            Director: ${film.Director}<br/>
            Actors: ${film.Actors}<br/>
            Genre: ${film.Genre}<br/>
            Runtime: ${film.Runtime}<br/>
            Rated: ${film.Rated}<br/>
            Plot: ${film.Plot}<br/>
            Ratings: ${ratingsText}<br/>
            Box office: ${film.BoxOffice ?? '—'}<br/>
            Awards: ${film.Awards ?? '—'}<br/>
            imdbID: ${film.imdbID}
          </div>
          <div class="clear"></div>
        </div>`;
    }).join('');

    resultsDiv.innerHTML = cards
      + `<details><summary style="cursor:pointer;font-size:12px;margin-top:12px">▶ Raw JSON response (search)</summary>`
      + `<pre class="raw-dump">${JSON.stringify(searchData, null, 2)}</pre></details>`
      + `<details><summary style="cursor:pointer;font-size:12px;margin-top:6px">▶ Raw JSON response (first detail)</summary>`
      + `<pre class="raw-dump">${JSON.stringify(details[0], null, 2)}</pre></details>`;

  } catch (err) {
    resultsDiv.innerHTML = `<p class="error">Error: ${err.message}</p>`;
  }
}