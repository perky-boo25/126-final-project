class PaletteCollection {
  static instances = {};

  constructor(config) {
    this.type = config.type;
    this.endpoint = config.endpoint;
    this.badgeImg = config.badgeImg;
    this.trackId = config.trackId;
    this.badgeLabel = config.badgeLabel;
    this.badgeColor = config.badgeColor || "#1db954";
    this.imgPlaceholder = config.imgPlaceholder || "♪";
    this.sheetTitle = config.sheetTitle;
    this.searchPlaceholder = config.searchPlaceholder;
    this.filters = config.filters || [
      {
        label: "All",
        value: "all",
      },
    ];
    this.visibleCount = config.visibleCount || 5;

    this.items = [];
    this.currentIndex = 0;
    this.activeFilter = "all";
    this.searchQuery = "";

    PaletteCollection.instances[this.type] = this;
  }

  static getInstance(type) {
    return PaletteCollection.instances[type];
  }

  async initialize() {
    try {
      console.log("Fetching:", this.endpoint);

      const response = await fetch(this.endpoint);

      console.log("Response:", response);

      if (!response.ok) throw new Error(`HTTP fetch error: ${response.status}`);

      this.items = await response.json();

      console.log("Loaded items:", this.items);

      // Hydrate liked + rating from Firestore (non-blocking — carousel builds
      // immediately then re-renders once the reads come back).
      if (window.PaletteDB) {
        window.PaletteDB.prefetchItems(this.type, this.items).then(() => {
          this.buildCarousel();
        });
      }

      this.buildCarousel();
    } catch (error) {
      console.error(`[${this.type.toUpperCase()}] Loading failure:`, error);
    }
  }

  getCardImage(item) {
    return item.img
      ? `<img src="${item.img}" alt="${item.title}" onerror="this.style.display='none'">`
      : `<div style="width:100%;height:100%;background:#2a1a2a;display:flex;align-items:center;justify-content:center;color:#555;font-size:24px;">${this.imgPlaceholder}</div>`;
  }

  buildCarousel() {
    const track = document.getElementById(this.trackId);
    if (!track) return;

    // Books get bare cover cards; everything else gets the full music card
    if (this.type === "books") {
      track.innerHTML = this.items
        .map(
          (item, index) => `
        <div class="book-cover-card"
            onclick="PaletteCollection.getInstance('${this.type}').openPopup(${index})"
            title="${item.title}">
          ${
            item.img
              ? `<img src="${item.img}" alt="${item.title}"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
              : ""
          }
          <div class="book-cover-placeholder" ${item.img ? 'style="display:none"' : ""}>📚</div>
        </div>`,
        )
        .join("");
    } else {
      track.innerHTML = this.items
        .map(
          (item, index) => `
        <div class="music-card"
            onclick="PaletteCollection.getInstance('${this.type}').openPopup(${index})">
          <div class="music-card-img">${this.getCardImage(item)}</div>
          <div class="music-card-body">
            <div class="spotify-badge">
              <img src="${this.badgeImg || ""}" class="badge-png" alt=""
                 onerror="this.style.display='none'">
              <span class="badge-text" style="color:${this.badgeColor}">${this.badgeLabel}</span>
            </div>
            <p class="music-title">${item.title}</p>
            <p class="music-artist">${item.subtitle}</p>
          </div>
          <button class="heart-btn ${item.liked ? "liked" : ""}"
            onclick="event.stopPropagation();
                   PaletteCollection.getInstance('${this.type}').toggleLike(event, ${index})"
          aria-label="Like">${item.liked ? "♥" : "♡"}</button>
      </div>`,
        )
        .join("");
    }

    this.updateTrackPosition();
  }

  updateTrackPosition() {
    const track = document.getElementById(this.trackId);
    if (!track) return;
    const cards = track.children;
    if (!cards.length) return;

    if (this.type === "books") {
      const cardW = 110 + 6; // 110px card + 6px gap
      track.style.transform = `translateX(-${this.currentIndex * cardW}px)`;
    } else {
      const outer = track.parentElement;
      const cardWidth = outer.clientWidth / this.visibleCount;
      track.style.transform = `translateX(-${this.currentIndex * (cardWidth + 12)}px)`;
    }
  }

  slide(direction) {
    const maxOffset = this.items.length - this.visibleCount;
    this.currentIndex = Math.max(
      0,
      Math.min(this.currentIndex + direction, maxOffset),
    );
    this.updateTrackPosition();
  }

  toggleLike(event, index) {
    this.items[index].liked = !this.items[index].liked;
    const liked = this.items[index].liked;

    // Persist to Firestore
    if (window.PaletteDB) {
      window.PaletteDB.setLiked(this.type, this.items[index].title, liked);
    }

    if (event && event.currentTarget) {
      const btn = event.currentTarget;
      btn.classList.toggle("liked", liked);
      btn.textContent = liked ? "♥" : "♡";
    }
    if (
      document.getElementById("palette-sheet-overlay").style.display === "flex"
    ) {
      PaletteSheet.renderGrid();
    }
    this.buildCarousel();
  }

  openPopup(index) {
    const item = this.items[index];
    PalettePopup.open({
      type: this.type,
      title: item.title,
      subtitle: item.subtitle,
      img: item.img,
      imgPlaceholder: this.imgPlaceholder,
      badge: this.badgeLabel,
      badgeColor: this.badgeColor,
      tags: [item.genre.toUpperCase()],
      description: item.description,
      meta: item.meta || [],
      liked: item.liked,
      link: item.link,
      rating: item.rating || 0,
      onLike: (newState) => {
        this.items[index].liked = newState;
        this.buildCarousel();
      },
    });
  }

  openSheet() {
    PaletteSheet.open(this);
  }
}

/**
 * REDESIGNED POPUP MANAGER (STARS MOVED BELOW BUTTONS)
 */
const PalettePopup = {
  _activeConfig: null,
  _pickedRating: 0,
  _logbookRating: 0,

  // ── Open: render shell immediately, then load Firestore aggregates ──
  open(config) {
    this._activeConfig = config;
    this._pickedRating = 0;
    this._renderPopup(config);
    this._loadFirestoreData(config);
  },

  // ── Query Firestore for aggregated avg rating + review count + review docs ──
  async _loadFirestoreData(config) {
    if (!window.db) return;
    try {
      const {
        collection,
        query,
        where,
        getAggregateFromServer,
        sum,
        count,
        average,
        getDocs,
        orderBy,
        limit,
      } =
        await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");

      const postsRef = collection(window.db, "posts");
      const itemQuery = query(
        postsRef,
        where("title", "==", config.title),
        where("category", "==", config.type),
      );

      // Firestore aggregation — cheap, no document downloads
      const aggSnap = await getAggregateFromServer(itemQuery, {
        totalReviews: count(),
        avgRating: average("rating"),
      });
      const totalReviews = aggSnap.data().totalReviews || 0;
      const avgRating = aggSnap.data().avgRating || 0;

      // Update the aggregate badge in the header
      const badge = document.getElementById("pp-agg-badge");
      if (badge) {
        badge.innerHTML = `
          <span class="pp-agg-stars">${this._starsDisplay(avgRating)}</span>
          <span class="pp-agg-count">${avgRating.toFixed(1)} stars</span>
          <span class="pp-agg-sep">·</span>
          <span class="pp-agg-count">${totalReviews} review${totalReviews !== 1 ? "s" : ""}</span>`;
      }

      // Fetch up to 20 latest review docs
      const revQuery = query(
        itemQuery,
        orderBy("datePosted", "desc"),
        limit(20),
      );
      const revSnap = await getDocs(revQuery);
      const reviews = revSnap.docs.map((d) => d.data());

      const list = document.getElementById("pp-reviews-list");
      if (list) list.innerHTML = this._renderReviews(reviews);
    } catch (err) {
      console.warn("[PalettePopup] Firestore load error:", err);
    }
  },

  // ── Stars display (read-only, yellow filled) ──
  _starsDisplay(avg) {
    const rounded = Math.round(avg);
    return [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<span class="${n <= rounded ? "pp-agg-star--on" : "pp-agg-star--off"}">★</span>`,
      )
      .join("");
  },

  // ── Interactive rate-this stars ──
  _starPickHTML(config) {
    const rating = config.rating || 0;
    return [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button class="pp-star ${n <= rating ? "pp-star--on" : ""}"
               onclick="PalettePopup._setRating('${config.title}',${n})">★</button>`,
      )
      .join("");
  },

  // ── Full popup HTML (matches wireframe: pink/white, stars top-right) ──
  _renderPopup(config) {
    const overlay = document.getElementById("palette-popup-overlay");
    const tagsHTML = (config.tags || [])
      .map((t) => `<span class="pp-genre-tag">${t}</span>`)
      .join("");

    overlay.innerHTML = `
      <div class="pp-card">

        <!-- HEADER — dark pink band -->
        <div class="pp-header">
          <button class="pp-close-btn" onclick="PalettePopup.close()" aria-label="Close">✕</button>

          <div class="pp-header-inner">

            <!-- Artwork -->
            <div class="pp-artwork">
              ${
                config.img
                  ? `<img src="${config.img}" alt="${config.title}" style="width:100%;height:100%;object-fit:cover;">`
                  : `<div class="pp-img-placeholder">${config.imgPlaceholder || "♪"}</div>`
              }
            </div>

            <!-- Right meta column -->
            <div class="pp-meta">

              <!-- Title + subtitle -->
              <div class="pp-title-block">
                <h2 class="pp-title">${config.title}</h2>
                <p class="pp-subtitle">${config.subtitle}</p>
              </div>

              <!-- Aggregate rating badge (populated by Firestore) -->
              <div class="pp-agg-badge" id="pp-agg-badge">
                <span class="pp-agg-stars">${this._starsDisplay(config.rating || 0)}</span>
                <span class="pp-agg-count">${config.rating ? config.rating.toFixed(1) + " stars" : "No ratings yet"}</span>
              </div>

              <!-- Genre tags + action buttons -->
              <div class="pp-meta-bottom">
                <div class="pp-tags">${tagsHTML}</div>
                <div class="pp-actions">
                  <button class="pp-like-btn ${config.liked ? "pp-like-btn--liked" : ""}"
                          id="pp-like-btn"
                          onclick="PalettePopup._toggleLike()">
                    ${config.liked ? "♥" : "♡"} Like
                  </button>
                  <button class="pp-logbook-btn" onclick="PalettePopup._addToLogbook()">
                    + Add to Logbook
                  </button>
                  <div class="pp-logbook-rating-row">
                    ${[1,2,3,4,5].map(n =>
                      `<button class="pp-log-star" onclick="PalettePopup._setLogbookRating(${n})">★</button>`
                    ).join('')}
                  </div>
                </div>
              </div>

            </div><!-- /.pp-meta -->
          </div><!-- /.pp-header-inner -->
        </div><!-- /.pp-header -->

        <!-- BODY — light cream -->
        <div class="pp-body">

          <!-- About -->
          <section class="pp-section">
            <h3 class="pp-section-title">About</h3>
            <div class="pp-divider"></div>
            <p class="pp-description">${config.description || "No description available."}</p>
            <div class="pp-meta-list">
              ${(config.meta || [])
                .map(
                  (m) =>
                    `<span class="pp-meta-item"><strong>${m.label}:</strong> ${m.value}</span>`,
                )
                .join("")}
            </div>
            ${
              config.link
                ? `<a class="pp-ext-link" href="${config.link.url}" target="_blank">${config.link.label} ↗</a>`
                : ""
            }
          </section>

          <!-- Reviews -->
          <section class="pp-section">
            <h3 class="pp-section-title">Reviews</h3>
            <div class="pp-divider"></div>

            <!-- Input row: avatar · [text + stars] · send -->
            <div class="pp-review-input-row" style="align-items:flex-start;">
              <div class="pp-avatar pp-avatar--you" style="margin-top:6px;">you</div>
              <div class="pp-input-area">
                <input class="pp-review-input"
                       id="pp-review-input"
                       type="text"
                       placeholder="Add a review…"
                       onkeydown="if(event.key==='Enter') PalettePopup._submitReview()">
                <div class="pp-input-stars" id="pp-input-stars">
                  ${[1, 2, 3, 4, 5]
                    .map(
                      (n) =>
                        `<button class="pp-spick-btn" onclick="PalettePopup._pickStar(${n})">★</button>`,
                    )
                    .join("")}
                </div>
              </div>
              <button class="pp-send-btn" onclick="PalettePopup._submitReview()"
                      style="align-self:flex-start;margin-top:4px;flex-shrink:0;">
                <i class="fa-solid fa-paper-plane"></i>
              </button>
            </div>

            <!-- Review list (populated by Firestore) -->
            <div id="pp-reviews-list">
              <p class="pp-no-reviews">Loading reviews…</p>
            </div>
          </section>

        </div><!-- /.pp-body -->
      </div><!-- /.pp-card -->`;

    overlay.style.display = "flex";
  },

  // ── Render review rows from Firestore posts docs ──
  _renderReviews(docs) {
    if (!docs || !docs.length)
      return `<p class="pp-no-reviews">No reviews yet — be the first!</p>`;

    return docs
      .map((r) => {
        const username = r.username || r.user || "user";
        const avatar = r.userProfilePicture
          ? `<img src="${r.userProfilePicture}" alt="${username}" class="pp-avatar-img">`
          : `<div class="pp-avatar">${username[0].toUpperCase()}</div>`;
        const stars = [1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<span class="${n <= (r.rating || 0) ? "pp-rv-star--on" : "pp-rv-star--off"}">★</span>`,
          )
          .join("");
        const date = r.datePosted?.toDate
          ? r.datePosted.toDate().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "";

        return `
      <div class="pp-review-row">
        ${avatar}
        <div class="pp-review-content">
          <div class="pp-review-meta-row">
            <span class="pp-review-user">@${username}</span>
            <span class="pp-review-stars">${stars}</span>
            ${date ? `<span class="pp-review-date">${date}</span>` : ""}
          </div>
          <p class="pp-review-text">${r.body || r.text || ""}</p>
        </div>
      </div>`;
      })
      .join("");
  },

  // ── Star pick for new review ──
  _pickStar(n) {
    this._pickedRating = n;
    document
      .querySelectorAll(".pp-spick-btn")
      .forEach((b, i) => b.classList.toggle("pp-spick-btn--on", i < n));
  },

  // ── Submit new review to Firestore posts collection ──
  async _submitReview() {
    const input = document.getElementById("pp-review-input");
    const text = (input?.value || "").trim();
    if (!text) return;

    const config = this._activeConfig;
    const rating = this._pickedRating;

    // Optimistic UI update
    const list = document.getElementById("pp-reviews-list");
    const placeholder = list?.querySelector(".pp-no-reviews");
    if (placeholder) placeholder.remove();

    const tempRow = document.createElement("div");
    tempRow.className = "pp-review-row";
    tempRow.innerHTML = `
      <div class="pp-avatar pp-avatar--you">you</div>
      <div class="pp-review-content">
        <div class="pp-review-meta-row">
          <span class="pp-review-user">@you</span>
          <span class="pp-review-stars">
            ${[1, 2, 3, 4, 5]
              .map(
                (n) =>
                  `<span class="${n <= rating ? "pp-rv-star--on" : "pp-rv-star--off"}">★</span>`,
              )
              .join("")}
          </span>
        </div>
        <p class="pp-review-text">${text}</p>
      </div>`;
    list?.prepend(tempRow);

    input.value = "";
    this._pickedRating = 0;
    document
      .querySelectorAll(".pp-spick-btn")
      .forEach((b) => b.classList.remove("pp-spick-btn--on"));

    // Persist to Firestore posts collection
    if (window.db) {
      try {
        const { collection, addDoc, serverTimestamp } =
          await import("https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js");
        await addDoc(collection(window.db, "posts"), {
          title: config.title,
          category: config.type,
          body: text,
          rating: rating,
          username: "you",
          userId: "local",
          userProfilePicture: null,
          imageUrl: config.img || null,
          item: config.title,
          datePosted: serverTimestamp(),
          updatedAt: serverTimestamp(),
          stampCount: 0,
        });
        // Refresh aggregates
        this._loadFirestoreData(config);
      } catch (err) {
        console.warn("[PalettePopup] Review save error:", err);
      }
    }

    // Legacy PaletteDB fallback
    if (window.PaletteDB && config) {
      window.PaletteDB.addReview(config.type, config.title, {
        user: "you",
        text,
        rating,
      });
    }
  },

  _setRating(title, val) {
    if (!this._activeConfig) return;
    this._activeConfig.rating = val;
    const engine = PaletteCollection.getInstance(this._activeConfig.type);
    const item = engine?.items.find((i) => i.title === title);
    if (item) item.rating = val;
    if (window.PaletteDB)
      window.PaletteDB.setRating(this._activeConfig.type, title, val);
  },

  _setLogbookRating(n) {
    this._logbookRating = n;
    document.querySelectorAll('.pp-log-star').forEach((b, i) => {
      b.classList.toggle('pp-log-star--on', i < n);
    });
  },

  _toggleLike() {
    const cfg = this._activeConfig;
    if (!cfg) return;
    cfg.liked = !cfg.liked;
    if (cfg.onLike) cfg.onLike(cfg.liked);
    const btn = document.getElementById("pp-like-btn");
    if (btn) {
      btn.classList.toggle("pp-like-btn--liked", cfg.liked);
      btn.innerHTML = `${cfg.liked ? "♥" : "♡"} Like`;
    }
    if (window.PaletteDB)
      window.PaletteDB.setLiked(cfg.type, cfg.title, cfg.liked);
  },

  async _addToLogbook() {
    const cfg = this._activeConfig;
    if (!cfg) return;

    const btn = document.querySelector(".pp-logbook-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }

    try {
      await LogbookSync.addToLogbook(cfg.type, {
        id:          cfg.title,
        title:       cfg.title,
        subtitle:    cfg.subtitle,
        img:         cfg.img   || null,
        genre:       (cfg.tags && cfg.tags[0]) ? cfg.tags[0].toLowerCase() : "other",
        description: cfg.description || "",
        meta:        cfg.meta  || [],
        link:        cfg.link  || null,
        rating:      this._logbookRating || cfg.rating || 0,
      });
      if (btn) { btn.textContent = "✓ Added!"; btn.style.background = "#c97d87"; }
    } catch (err) {
      console.error("[LOGBOOK] PalettePopup error:", err);
      if (btn) { btn.textContent = "Failed — try again"; btn.disabled = false; }
      return;
    }

    setTimeout(() => {
      if (btn) {
        btn.textContent = "+ Add to Logbook";
        btn.style.background = "";
        btn.disabled = false;
      }
    }, 2000);
  },

  close() {
    document.getElementById("palette-popup-overlay").style.display = "none";
    this._activeConfig = null;
    this._pickedRating = 0;
    this._logbookRating = 0;
  },
};

/**
 * GRID CONTAINER SHEET (VIEW ALL)
 */
const PaletteSheet = {
  activeInstance: null,

  open(instance) {
    this.activeInstance = instance;
    const overlay = document.getElementById("palette-sheet-overlay");
    overlay.innerHTML = `
      <div class="palette-sheet-modal">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #8f344a;padding-bottom:12px;">
          <h2 style="font-family:'Life Savers';color:#8f344a;font-size:22px;">${instance.sheetTitle}</h2>
          <button style="background:white;border:1px solid #8f344a;border-radius:50%;width:30px;height:30px;cursor:pointer;color:#8f344a;font-weight:bold;margin-left:auto;" onclick="PaletteSheet.close()">×</button>
        </div>
        <div style="margin-top:15px;display:flex;gap:15px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="sheet-search-input" placeholder="${instance.searchPlaceholder}" style="padding:8px 14px;border-radius:20px;border:1px solid #8f344a;outline:none;width:250px;" value="${instance.searchQuery}">
          <div style="display:flex;gap:6px;">
            ${instance.filters.map((f) => `<span class="filter-pill ${instance.activeFilter === f.value ? "active" : ""}" onclick="PaletteSheet.changeFilter('${f.value}')">${f.label}</span>`).join("")}
          </div>
        </div>
        <div class="palette-grid" id="sheet-grid-container"></div>
      </div>
    `;
    overlay.style.display = "flex";
    document.getElementById("sheet-search-input").oninput = (e) => {
      this.activeInstance.searchQuery = e.target.value.toLowerCase();
      this.renderGrid();
    };
    this.renderGrid();
  },

  changeFilter(filterValue) {
    if (!this.activeInstance) return;
    this.activeInstance.activeFilter = filterValue;
    this.open(this.activeInstance);
  },

  renderGrid() {
    console.log("RENDER GRID RUNNING");
    const container = document.getElementById("sheet-grid-container");
    const inst = this.activeInstance;

    console.log("Container:", container);
    console.log("Instance:", inst);

    if (!container || !inst) return;

    container.innerHTML = inst.items
      .map((item, idx) => {
        console.log(item);
        const matchGenre =
          inst.activeFilter === "all" || item.genre === inst.activeFilter;
        const matchQuery =
          !inst.searchQuery ||
          item.title.toLowerCase().includes(inst.searchQuery);
        if (!(matchGenre && matchQuery)) return "";
        return `
        <div class="palette-grid-card" onclick="PaletteCollection.instances['${inst.type}'].openPopup(${idx})">
          <div class="palette-grid-card-img">${inst.getCardImage(item)}</div>
          <div class="palette-grid-card-body">
            <div class="spotify-badge">
              ${inst.badgeImg ? `<img src="${inst.badgeImg}" class="badge-png" alt="" onerror="this.style.display='none'">` : ""}
              <span class="badge-text" style="color:${inst.badgeColor}">${inst.badgeLabel}</span>
            </div>
            <p class="music-title">${item.title}</p>
            <p class="music-artist">${item.subtitle}</p>
          </div>
          <button class="heart-btn ${item.liked ? "liked" : ""}"
            onclick="event.stopPropagation(); PaletteCollection.instances['${inst.type}'].toggleLike(null, ${idx});"
            aria-label="Like">${item.liked ? "♥" : "♡"}</button>
        </div>`;
      })
      .join("");
  },

  close() {
    document.getElementById("palette-sheet-overlay").style.display = "none";
    this.activeInstance = null;
  },
};

/* ── OVERLAY INTERCEPTORS ── */
document.getElementById("palette-popup-overlay").onclick = function (e) {
  if (e.target === this) PalettePopup.close();
};
document.getElementById("palette-sheet-overlay").onclick = function (e) {
  if (e.target === this) PaletteSheet.close();
};

window.addEventListener("resize", () => {
  Object.values(PaletteCollection.instances).forEach((inst) =>
    inst.updateTrackPosition(),
  );
});

(function patchMoviesCarousel() {
  const _original = PaletteCollection.prototype.buildCarousel;

  PaletteCollection.prototype.buildCarousel = function () {
    // keep original logic for music/books
    if (this.type !== "movies") {
      return _original.call(this);
    }

    const track = document.getElementById(this.trackId);
    if (!track) return;

    track.innerHTML = this.items
      .map(
        (item, index) => `
      <div class="movie-poster-card"
           onclick="PaletteCollection.getInstance('movies').openPopup(${index})"
           title="${item.title}">

        ${
          item.img
            ? `<img src="${item.img}" alt="${item.title}"
                  onerror="this.style.display='none';
                           this.nextElementSibling.style.display='flex'">`
            : ""
        }

        <div class="movie-poster-placeholder"
             ${item.img ? 'style="display:none"' : ""}>
             🎬
        </div>

        <div class="movie-poster-info">
          <p class="movie-poster-title">${item.title}</p>
          <p class="movie-poster-sub">${item.subtitle}</p>
        </div>

        <button class="heart-btn ${item.liked ? "liked" : ""}"
          onclick="event.stopPropagation();
                   PaletteCollection.getInstance('movies').toggleLike(event, ${index})"
          aria-label="Like">

          ${item.liked ? "♥" : "♡"}
        </button>
      </div>
    `,
      )
      .join("");

    this.updateTrackPosition();
  };
})();

(function patchArtCarousel() {
  const _original = PaletteCollection.prototype.buildCarousel;

  PaletteCollection.prototype.buildCarousel = function () {
    if (this.type !== "art") {
      return _original.call(this); // music / books / movies unchanged
    }

    const track = document.getElementById(this.trackId);
    if (!track) return;

    track.innerHTML = this.items
      .map(
        (item, index) => `
      <div class="art-frame-card"
           onclick="PaletteCollection.getInstance('art').openPopup(${index})"
           title="${item.title}">
 
        <!-- Gilded mat + image (height auto — never cropped) -->
        <div class="art-frame-mat">
          ${
            item.img
              ? `<img src="${item.img}" alt="${item.title}"
                    onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
              : ""
          }
          <div class="art-img-placeholder"
               ${item.img ? 'style="display:none"' : ""}>🖼️</div>
        </div>
 
        <!-- Caption below the frame -->
        <div class="art-caption">
          <span class="art-caption-title">${item.title}</span>
          <span class="art-caption-sub">${item.subtitle}</span>
        </div>
 
        <!-- Heart button — bottom-right corner -->
        <button class="heart-btn ${item.liked ? "liked" : ""}"
          onclick="event.stopPropagation();
                   PaletteCollection.getInstance('art').toggleLike(event, ${index})"
          aria-label="Like">${item.liked ? "♥" : "♡"}</button>
 
      </div>`,
      )
      .join("");

    this.updateTrackPosition();
  };
})();

(function patchArtTrackPosition() {
  const _original = PaletteCollection.prototype.updateTrackPosition;

  PaletteCollection.prototype.updateTrackPosition = function () {
    if (this.type !== "art") {
      return _original.call(this); // all other types unchanged
    }

    const track = document.getElementById(this.trackId);
    if (!track || !track.children.length) return;

    const CARD_WIDTH = 220; // matches .art-frame-card width in CSS
    const GAP = 32; // matches .art-track gap in CSS
    track.style.transform = `translateX(-${this.currentIndex * (CARD_WIDTH + GAP)}px)`;
  };
})();

// ── Patch: updateTrackPosition — letters uses CSS grid, not transform ──
(function patchLettersTrackPosition() {
  const _original = PaletteCollection.prototype.updateTrackPosition;

  PaletteCollection.prototype.updateTrackPosition = function () {
    if (this.type === "letters") return; // grid layout — no transform needed
    return _original.call(this);
  };
})();

// ── Patch: slide — letters has no carousel to slide ──
(function patchLettersSlide() {
  const _original = PaletteCollection.prototype.slide;

  PaletteCollection.prototype.slide = function (direction) {
    if (this.type === "letters") return; // no-op for grid
    return _original.call(this, direction);
  };
})();

const LetterPopup = {
  _reviews: {}, // keyed by item.id
  _pickedRating: 0,
  _logbookRating: 0,
  _activeItem: null,
  _activeInst: null,
  _activeIndex: null,

  open(item, index, instance) {
    this._activeItem = item;
    this._activeInst = instance;
    this._activeIndex = index;
    this._pickedRating = 0;

    if (!this._reviews[item.id]) {
      this._reviews[item.id] = item.reviews ? [...item.reviews] : [];
    }

    const overlay = document.getElementById("palette-popup-overlay");
    overlay.innerHTML = this._buildHTML(item);
    overlay.style.display = "flex";

    // Load fresh data from Firestore (rating + reviews)
    if (window.PaletteDB) {
      window.PaletteDB.getItemData("letters", item.title).then((data) => {
        // Update rating display
        if (data.rating && data.rating !== (item.rating || 0)) {
          item.rating = data.rating;
          if (instance) instance.items[index].rating = data.rating;
          const ratingEl = overlay.querySelector(".letter-popup-rating");
          if (ratingEl) {
            ratingEl.innerHTML = [1, 2, 3, 4, 5]
              .map(
                (i) =>
                  `<span class="${i <= data.rating ? "" : "off"}">★</span>`,
              )
              .join("");
          }
        }
        // Update reviews
        if (data.reviews && data.reviews.length) {
          this._reviews[item.id] = data.reviews;
          const list = document.getElementById("letter-reviews-list");
          if (list) list.innerHTML = this._renderReviews(data.reviews);
        }
      });
    }
  },

  _buildHTML(item) {
    const tagsHTML = (item.tags || [])
      .map((t) => `<span class="letter-popup-tag">${t}</span>`)
      .join("");

    const ratingHTML = [1, 2, 3, 4, 5]
      .map(
        (i) => `<span class="${i <= (item.rating || 0) ? "" : "off"}">★</span>`,
      )
      .join("");

    return `
      <div class="letter-popup-paper">
        <button class="letter-close-btn" onclick="LetterPopup.close()" aria-label="Close">✕</button>
 
        <!-- top rule -->
        <div class="letter-header-deco"><span>✉</span></div>
 
        <!-- title -->
        <h2 class="letter-popup-title">${item.title}</h2>
 
        <!-- meta: date + tags + overall rating -->
        <div class="letter-popup-meta">
          <span class="letter-popup-date">${item.date}</span>
          ${tagsHTML}
          <div class="letter-popup-rating" title="Overall rating">
            ${ratingHTML}
          </div>
        </div>
 
        <hr class="letter-popup-hr">
 
        <!-- full letter body -->
        <div class="letter-popup-body">${item.description}</div>
 
        <hr class="letter-popup-hr">
 
        <!-- actions -->
        <div class="letter-popup-actions">
          <button class="letter-like-btn ${item.liked ? "liked" : ""}"
                  id="letter-like-btn"
                  onclick="LetterPopup._toggleLike()">
            ${item.liked ? "♥" : "♡"} Like
          </button>
          <button class="letter-logbook-btn" onclick="LetterPopup._addToLogbook()">
            + Add to Logbook
          </button>
          <div class="letter-logbook-rating-row">
            ${[1,2,3,4,5].map(n =>
              `<button class="letter-log-star" onclick="LetterPopup._setLogbookRating(${n})">★</button>`
            ).join('')}
          </div>
        </div>
 
        <!-- reviews -->
        <div class="letter-reviews-section">
          <h3 class="letter-reviews-title">Responses</h3>
 
          <!-- input row -->
          <div class="letter-review-input-row">
            <div class="letter-av">yo</div>
            <div class="letter-star-pick" id="letter-spick">
              <button onclick="LetterPopup._pickStar(1)">★</button>
              <button onclick="LetterPopup._pickStar(2)">★</button>
              <button onclick="LetterPopup._pickStar(3)">★</button>
              <button onclick="LetterPopup._pickStar(4)">★</button>
              <button onclick="LetterPopup._pickStar(5)">★</button>
            </div>
            <input class="letter-review-input" id="letter-review-input"
                   type="text" placeholder="leave a response…"
                   onkeydown="if(event.key==='Enter') LetterPopup._submit()">
            <button class="letter-send-btn" onclick="LetterPopup._submit()">Send</button>
          </div>
 
          <!-- existing reviews -->
          <div id="letter-reviews-list">
            ${this._renderReviews(this._reviews[item.id])}
          </div>
        </div>
 
      </div>`;
  },

  _renderReviews(reviews) {
    if (!reviews || !reviews.length)
      return `<p class="letter-no-reviews">no responses yet — be the first to write back.</p>`;

    return reviews
      .map(
        (r) => `
      <div class="letter-review-row">
        <div class="letter-av-other">${r.user[0].toUpperCase()}</div>
        <div class="letter-review-content">
          <span class="letter-review-user">@${r.user}</span>
          <p class="letter-review-text">${r.text}</p>
        </div>
        <div class="letter-review-stars">
          ${[1, 2, 3, 4, 5]
            .map(
              (i) =>
                `<span class="${i <= (r.rating || 0) ? "" : "off"}">★</span>`,
            )
            .join("")}
        </div>
      </div>`,
      )
      .join("");
  },

  _pickStar(n) {
    this._pickedRating = n;
    document
      .querySelectorAll("#letter-spick button")
      .forEach((b, i) => b.classList.toggle("on", i < n));
  },

  _submit() {
    const input = document.getElementById("letter-review-input");
    const text = input.value.trim();
    if (!text) return;

    const id = this._activeItem.id;
    if (!this._reviews[id]) this._reviews[id] = [];
    const review = {
      user: "you",
      text,
      rating: this._pickedRating,
    };
    this._reviews[id].unshift(review);

    input.value = "";
    this._pickedRating = 0;
    document
      .querySelectorAll("#letter-spick button")
      .forEach((b) => b.classList.remove("on"));

    document.getElementById("letter-reviews-list").innerHTML =
      this._renderReviews(this._reviews[id]);

    // Persist to Firestore
    if (window.PaletteDB) {
      window.PaletteDB.addReview("letters", this._activeItem.title, review);
    }
  },

  _toggleLike() {
    const item = this._activeItem;
    item.liked = !item.liked;

    /* sync back into the engine's items array */
    if (this._activeInst && this._activeIndex !== null) {
      this._activeInst.items[this._activeIndex].liked = item.liked;
      this._activeInst.buildCarousel();
    }

    const btn = document.getElementById("letter-like-btn");
    if (btn) {
      btn.classList.toggle("liked", item.liked);
      btn.innerHTML = `${item.liked ? "♥" : "♡"} Like`;
    }

    // Persist to Firestore
    if (window.PaletteDB) {
      window.PaletteDB.setLiked("letters", item.title, item.liked);
    }
  },

  async _addToLogbook() {
    const item = this._activeItem;
    if (!item) return;

    const btn = document.querySelector(".letter-logbook-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Adding…"; }

    try {
      await LogbookSync.addToLogbook("letters", item);
      if (btn) { btn.textContent = "✓ Added!"; btn.style.background = "#4caf50"; }
    } catch (err) {
      console.error("[LOGBOOK] LetterPopup error:", err);
      if (btn) { btn.textContent = "Failed — try again"; btn.disabled = false; }
      return;
    }

    setTimeout(() => {
      if (btn) {
        btn.textContent = "+ Add to Logbook";
        btn.style.background = "";
        btn.disabled = false;
      }
    }, 2000);
  },

  close() {
    document.getElementById("palette-popup-overlay").style.display = "none";
    this._activeItem = null;
    this._activeInst = null;
    this._activeIndex = null;
    this._logbookRating = 0;
  },
};

// ── patchLettersSheet — polaroid version (replaces the envelope version) ──
(function patchLettersSheet() {
  const _origRenderGrid = PaletteSheet.renderGrid.bind(PaletteSheet);

  PaletteSheet.renderGrid = function () {
    const inst = this.activeInstance;
    // Only intercept if we are rendering the 'letters' (Journals) collection
    if (!inst || inst.type !== "letters") return _origRenderGrid();

    const container = document.getElementById("sheet-grid-container");
    if (!container) return;

    /* Override the grid class to our new view-all layout */
    container.className = "view-all-grid";

    container.innerHTML = inst.items
      .map((item, idx) => {
        const matchGenre =
          inst.activeFilter === "all" || item.genre === inst.activeFilter;
        const matchQuery =
          !inst.searchQuery ||
          item.title.toLowerCase().includes(inst.searchQuery) ||
          item.excerpt?.toLowerCase().includes(inst.searchQuery);

        if (!(matchGenre && matchQuery)) return "";

        // Map data fields safely
        const imgSrc = item.img || "";
        const title = item.title || "Untitled";
        const sub = item.date || item.subtitle || "";
        const snippet =
          item.excerpt ||
          (item.description ? item.description.slice(0, 100) + "…" : "");

        return `
        <div class="static-pin-card"
             onclick="PaletteCollection.getInstance('letters').openPopup(${idx})">
          
          <div class="static-pin-card-img">
              ${imgSrc ? `<img src="${imgSrc}" alt="${title}">` : ""}
          </div>
          
          <p class="static-pin-card-title">${title}</p>
          <p class="static-pin-card-sub">${sub}</p>
          <p class="static-pin-card-snippet">${snippet}</p>

          <button class="heart-btn ${item.liked ? "liked" : ""}"
                  onclick="event.stopPropagation();
                           PaletteCollection.getInstance('letters').toggleLike(null, ${idx})"
                  aria-label="Like">${item.liked ? "♥" : "♡"}</button>
        </div>`;
      })
      .join("");
  };
})();

/* ── BOOTSTRAP ── */
const MusicEngine = new PaletteCollection({
  type: "music",
  endpoint: "/data/songs.json",
  badgeImg: "Discover/images/spotify-logo.png",
  trackId: "music-track",
  badgeLabel: "SPOTIFY",
  badgeColor: "#1db954",
  imgPlaceholder: "♪",
  sheetTitle: "★ soundwaves & sentiments",
  searchPlaceholder: "search songs...",
  filters: [
    { label: "All", value: "all" },
    { label: "Pop", value: "pop" },
    { label: "Indie", value: "indie" },
  ],
});

const BookEngine = new PaletteCollection({
  type: "books",
  endpoint: "/data/books.json",
  badgeImg: "Discover/images/goodreads-logo.png",
  trackId: "books-track",
  badgeLabel: "GOODREADS",
  badgeColor: "#8a6d53",
  imgPlaceholder: "★",
  sheetTitle: "★ stories and spines library",
  searchPlaceholder: "search books...",
  filters: [
    { label: "All", value: "all" },
    { label: "Fiction", value: "fiction" },
    { label: "Sci-Fi", value: "scifi" },
  ],
});

const MovieEngine = new PaletteCollection({
  type: "movies",
  endpoint: "/data/movies.json",
  badgeImg: "",
  trackId: "movies-track",
  badgeLabel: "LETTERBOXD",
  badgeColor: "#00c030",
  imgPlaceholder: "★",
  sheetTitle: "★ frames & feelings — all films",
  searchPlaceholder: "search films...",
  visibleCount: 5,
  filters: [
    { label: "All", value: "all" },
    { label: "Romance", value: "romance" },
    { label: "Drama", value: "drama" },
    { label: "Thriller", value: "thriller" },
    { label: "Animation", value: "animation" },
    { label: "Comedy", value: "comedy" },
  ],
});

const ArtEngine = new PaletteCollection({
  type: "art",
  endpoint: "/data/art.json",
  badgeImg: "",
  trackId: "art-track",
  badgeLabel: "GALLERY",
  badgeColor: "#5a3060",
  imgPlaceholder: "★",
  sheetTitle: "★ pigments & poetry — full gallery",
  searchPlaceholder: "search artworks...",
  visibleCount: 4,
  filters: [
    { label: "All", value: "all" },
    { label: "Impressionism", value: "impressionism" },
    { label: "Post-Impressionism", value: "post-impressionism" },
    { label: "Surrealism", value: "surrealism" },
    { label: "Renaissance", value: "renaissance" },
    { label: "Baroque", value: "baroque" },
    { label: "Ukiyo-e", value: "ukiyo-e" },
  ],
});

const LettersEngine = new PaletteCollection({
  type: "letters",
  endpoint: "/data/letters.json",
  badgeImg: "",
  trackId: "letters-track",
  badgeLabel: "JOURNAL",
  badgeColor: "#8a6a4a",
  imgPlaceholder: "★",
  sheetTitle: "★ letters & journals — all entries",
  searchPlaceholder: "search entries, moods…",
  visibleCount: 4,
  filters: [
    { label: "All", value: "all" },
    { label: "Personal", value: "personal" },
    { label: "Observations", value: "observations" },
    { label: "Realization", value: "realization" },
    { label: "Unsent", value: "unsent" },
    { label: "Hobby", value: "hobby" },
  ],
});

// ── Change 1: initialize() calls removed ──
// discoverAPI.js overrides each engine's initialize() and then boots all of
// them together via initAll(). Calling the base-class version here (before
// discoverAPI.js has loaded) would fire a letters.json fetch and stamp the
// carousel with the wrong data before the Firestore override ever runs.

// ── Change 2: no-op stub for LettersEngine ──
// Even if initAll() is somehow delayed, this prevents the base-class
// initialize() from ever running a fetch(letters.json) for this engine.
// discoverAPI.js overwrites this stub with the real Firestore override.
LettersEngine.initialize = async function () {
  // Replaced by discoverAPI.js — do not call the base-class fetch.
};

const MagicalPalette = (() => {
  /* ── Config ── */
  const PICK_COUNT = 6; // how many cards to show

  /* Type metadata: badge label, colour, placeholder emoji */
  const TYPE_META = {
    music: { label: "MUSIC", color: "#1db954", placeholder: "♪" },
    books: { label: "BOOKS", color: "#8a6d53", placeholder: "📚" },
    movies: { label: "FILM", color: "#00c030", placeholder: "🎬" },
    art: { label: "ART", color: "#5a3060", placeholder: "🖼️" },
    letters: { label: "JOURNAL", color: "#8a6a4a", placeholder: "✉️" },
  };

  /* ── Fisher-Yates shuffle (in-place) ── */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ── Wait for all engines to have loaded items ── */
  function waitForEngines() {
    const engineTypes = ["music", "books", "movies", "art", "letters"];
    const MAX_WAIT_MS = 8000;
    const POLL_MS = 120;

    return new Promise((resolve) => {
      const start = Date.now();

      const poll = () => {
        const allReady = engineTypes.every((t) => {
          const inst = PaletteCollection.getInstance(t);
          return inst && inst.items && inst.items.length > 0;
        });

        if (allReady) {
          resolve();
        } else if (Date.now() - start > MAX_WAIT_MS) {
          resolve(); // proceed with whatever has loaded
        } else {
          setTimeout(poll, POLL_MS);
        }
      };

      poll();
    });
  }

  /* ── Build the image zone for one card ── */
  function buildImageZone(item, type, slotIndex) {
    if (type === "letters") {
      /* Parchment preview instead of a square image */
      const stamp = STAMPS[slotIndex % STAMPS.length];
      return `
        <div class="mp-letter-preview">
          <div class="mp-letter-preview-stamp">${stamp}</div>
          <p class="mp-letter-preview-text">
            ${item.excerpt || (item.description || "").slice(0, 90) + "…"}
          </p>
        </div>`;
    }

    const meta = TYPE_META[type];
    if (item.img) {
      return `
        <div class="mp-card-img">
          <img src="${item.img}" alt="${item.title}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="mp-card-img mp-img--text" style="display:none">${meta.placeholder}</div>
        </div>`;
    }
    return `<div class="mp-card-img mp-img--text">${meta.placeholder}</div>`;
  }

  /* ── Open the correct modal for a scrambled card ── */
  function openCard(type, originalIndex) {
    const inst = PaletteCollection.getInstance(type);
    if (!inst) return;

    if (type === "letters") {
      const item = inst.items[originalIndex];
      LetterPopup.open(item, originalIndex, inst);
    } else {
      inst.openPopup(originalIndex);
    }
  }

  /* ── Render N scrambled cards into #magical-palette-grid ── */
  function render() {
    const grid = document.getElementById("magical-palette-grid");
    if (!grid) return;

    /* Aggregate all items, tagging each with its sourceType + originalIndex */
    const pool = [];
    ["music", "books", "movies", "art", "letters"].forEach((type) => {
      const inst = PaletteCollection.getInstance(type);
      if (!inst || !inst.items.length) return;
      inst.items.forEach((item, idx) => {
        pool.push({ item, type, originalIndex: idx });
      });
    });

    if (!pool.length) {
      grid.innerHTML = `<p style="color:#8a6a4a;font-family:'Life Savers';padding:20px;">
        nothing to show yet — check back soon ✦</p>`;
      return;
    }

    /* Shuffle and slice */
    const picked = shuffle([...pool]).slice(0, PICK_COUNT);

    /* Render */
    grid.innerHTML = picked
      .map(({ item, type, originalIndex }, slotIndex) => {
        const meta = TYPE_META[type];
        const subtitle = item.subtitle || item.artist || item.date || "";
        const isLiked = !!item.liked;

        return `
        <div class="mp-card"
             onclick="MagicalPalette._open('${type}', ${originalIndex})"
             title="${item.title}">
 
          <!-- Type ribbon -->
          <div class="mp-type-ribbon"
               style="background:${meta.color}">
            ${meta.label}
          </div>
 
          <!-- Image / preview zone -->
          ${buildImageZone(item, type, slotIndex)}
 
          <!-- Card body (mirrors .music-card-body) -->
          <div class="mp-card-body">
            <p class="mp-card-title">${item.title}</p>
            <p class="mp-card-sub">${subtitle}</p>
          </div>
 
          <!-- Heart (syncs to the originating engine's liked state) -->
          <button class="heart-btn ${isLiked ? "liked" : ""}"
                  onclick="event.stopPropagation(); MagicalPalette._toggleLike('${type}', ${originalIndex}, this)"
                  aria-label="Like">
            ${isLiked ? "♥" : "♡"}
          </button>
 
        </div>`;
      })
      .join("");
  }

  /* ── Public API ── */
  const api = {
    /* Called once on page load */
    async init() {
      await waitForEngines();
      render();
    },

    /* Called by the shuffle button */
    shuffle() {
      const btn = document.querySelector(".mp-refresh-btn");
      render();
    },

    /* Modal router — exposed globally for inline onclick */
    _open(type, originalIndex) {
      openCard(type, originalIndex);
    },

    /* Heart toggle — syncs back to engine and re-renders the card face */
    _toggleLike(type, originalIndex, btn) {
      const inst = PaletteCollection.getInstance(type);
      if (!inst) return;

      inst.items[originalIndex].liked = !inst.items[originalIndex].liked;
      const liked = inst.items[originalIndex].liked;

      btn.classList.toggle("liked", liked);
      btn.textContent = liked ? "♥" : "♡";

      /* Also rebuild that engine's carousel so the heart stays in sync */
      inst.buildCarousel();
    },
  };

  return api;
})();

/* ── Bootstrap: run after DOM + engines are ready ── */
MagicalPalette.init();
// ============================================================
//  LOGBOOK RATING STARS — styles
// ============================================================
(function injectLogbookStarStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── shared logbook star rows ── */
    .pp-logbook-rating-row,
    .letter-logbook-rating-row {
      display: flex;
      gap: 4px;
      margin-top: 6px;
    }

    /* ── PalettePopup logbook stars ── */
    .pp-log-star {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 20px;
      color: #d4a0aa;
      padding: 0;
      line-height: 1;
      transition: color 0.15s, transform 0.1s;
    }
    .pp-log-star:hover ~ .pp-log-star { color: #d4a0aa; }
    .pp-log-star:hover,
    .pp-log-star--on { color: #e8b84b; transform: scale(1.2); }

    /* ── LetterPopup logbook stars ── */
    .letter-log-star {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 20px;
      color: #c8b89a;
      padding: 0;
      line-height: 1;
      transition: color 0.15s, transform 0.1s;
    }
    .letter-log-star:hover,
    .letter-log-star--on { color: #e8b84b; transform: scale(1.2); }

    /* ── send button fix: always top-aligned ── */
    .pp-review-input-row { align-items: flex-start !important; }
    .pp-send-btn { align-self: flex-start !important; margin-top: 4px; flex-shrink: 0; }
  `;
  document.head.appendChild(style);
})();