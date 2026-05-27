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
  _reviews: {},
  _activeConfig: null,

  open(config) {
    const overlay = document.getElementById("palette-popup-overlay");

    // Seed local cache with any reviews already in config
    if (!this._reviews[config.title]) {
      this._reviews[config.title] = config.reviews || [];
    }

    // Render immediately with cached data, then refresh from Firestore
    this._renderPopup(config, this._reviews[config.title]);

    // Load fresh data from Firestore (rating + reviews)
    if (window.PaletteDB) {
      window.PaletteDB.getItemData(config.type, config.title).then((data) => {
        // Update rating on the live popup stars
        if (data.rating && data.rating !== config.rating) {
          config.rating = data.rating;
          const container = document.getElementById(
            `pp-stars-${config.title.replace(/\s/g, "_")}`
          );
          if (container) {
            container.innerHTML = [1, 2, 3, 4, 5]
              .map(
                (n) =>
                  `<button class="pp-star ${n <= data.rating ? "pp-star--on" : ""}"
                   onclick="PalettePopup._setRating('${config.title}',${n})">★</button>`
              )
              .join("");
          }
          // Sync back to engine
          const engine = PaletteCollection.getInstance(config.type);
          if (engine) {
            const item = engine.items.find((i) => i.title === config.title);
            if (item) item.rating = data.rating;
          }
        }
        // Update reviews list with Firestore data
        if (data.reviews && data.reviews.length) {
          this._reviews[config.title] = data.reviews;
          const list = document.getElementById("pp-reviews-list");
          if (list) list.innerHTML = this._renderReviews(data.reviews);
        }
      });
    }
  },

  _renderPopup(config, reviews) {
    const overlay = document.getElementById("palette-popup-overlay");

    const starHTML = (rating = config.rating || 0) =>
      [1, 2, 3, 4, 5]
        .map(
          (n) =>
            `<button class="pp-star ${n <= rating ? "pp-star--on" : ""}"
          onclick="PalettePopup._setRating('${config.title}',${n})">★</button>`,
        )
        .join("");

    const tagsHTML = (config.tags || [])
      .map((t) => `<span class="pp-genre-tag">${t}</span>`)
      .join("");

    overlay.innerHTML = `
      <div class="pp-card">
        <div class="pp-header">
          <button class="pp-close-btn" onclick="PalettePopup.close()">✕</button>
          <div class="pp-header-inner">
            <div class="pp-artwork">
               ${config.img ? `<img src="${config.img}" style="width:100%;height:100%;object-fit:cover;">` : `<div class="pp-img-placeholder">${config.imgPlaceholder}</div>`}
            </div>
            <div class="pp-meta">
              <div class="pp-meta-top">
                <div class="pp-title-block">
                  <h2 class="pp-title">${config.title}</h2>
                  <p class="pp-subtitle">${config.subtitle}</p>
                </div>
              </div>
              
              <div class="pp-meta-bottom">
                <div class="pp-tags">${tagsHTML}</div>
                <div class="pp-actions">
                  <button class="pp-like-btn ${config.liked ? "pp-like-btn--liked" : ""}" id="pp-like-btn" onclick="PalettePopup._toggleLike()">
                    ${config.liked ? "♥" : "♡"} Like
                  </button>
                  <button class="pp-logbook-btn" onclick="PalettePopup._addToLogbook()">+ Add to Logbook</button>
                </div>
              </div>

              <div class="pp-stars-container">
                <div class="pp-stars" id="pp-stars-${config.title.replace(/\s/g, "_")}">
                  ${starHTML(config.rating)}
                </div>
                <span style="color:#aaa; font-size:11px; margin-left:10px; font-family:sans-serif;">Rate this palette</span>
              </div>
            </div>
          </div>
        </div>
        <div class="pp-body">
          <section class="pp-section">
            <h3 class="pp-section-title">About</h3>
            <div class="pp-divider"></div>
            <p class="pp-description">${config.description || "No description available."}</p>
            <div class="pp-meta-list">${config.meta.map((m) => `<span class="pp-meta-item"><strong>${m.label}:</strong> ${m.value}</span>`).join("")}</div>
            ${config.link ? `<a class="pp-ext-link" href="${config.link.url}" target="_blank">${config.link.label} ↗</a>` : ""}
          </section>
          <section class="pp-section">
            <h3 class="pp-section-title">Reviews</h3>
            <div class="pp-divider"></div>
            <div class="pp-review-row pp-review-input-row">
              <div class="pp-avatar pp-avatar--you">you</div>
              <input class="pp-review-input" id="pp-review-input" type="text" placeholder="Add reviews" onkeydown="if(event.key==='Enter') PalettePopup._submitReview('${config.title}')">
            </div>
            <div id="pp-reviews-list">${this._renderReviews(reviews)}</div>
          </section>
        </div>
      </div>`;

    overlay.style.display = "flex";
    this._activeConfig = config;
  },

  _renderReviews(reviews) {
    if (!reviews.length) return `<p class="pp-no-reviews">No reviews yet.</p>`;
    return reviews
      .map(
        (r) => `
      <div class="pp-review-row">
        <div class="pp-avatar">${r.user[0].toUpperCase()}</div>
        <div class="pp-review-content">
          <span class="pp-review-user">${r.user}</span>
          <p class="pp-review-text">${r.text}</p>
        </div>
      </div>`,
      )
      .join("");
  },

  _submitReview(title) {
    const input = document.getElementById("pp-review-input");
    const text = input.value.trim();
    if (!text) return;
    if (!this._reviews[title]) this._reviews[title] = [];
    const review = { user: "you", text };
    this._reviews[title].unshift(review);
    input.value = "";
    document.getElementById("pp-reviews-list").innerHTML = this._renderReviews(
      this._reviews[title],
    );
    // Persist to Firestore
    if (window.PaletteDB && this._activeConfig) {
      window.PaletteDB.addReview(this._activeConfig.type, title, review);
    }
  },

  _setRating(title, val) {
    this._activeConfig.rating = val;
    // Update the local data in the engine
    const engine = PaletteCollection.getInstance(this._activeConfig.type);
    const item = engine.items.find((i) => i.title === title);
    if (item) item.rating = val;

    const container = document.getElementById(
      `pp-stars-${title.replace(/\s/g, "_")}`,
    );
    if (container) {
      container.innerHTML = [1, 2, 3, 4, 5]
        .map(
          (n) =>
            `<button class="pp-star ${n <= val ? "pp-star--on" : ""}" onclick="PalettePopup._setRating('${title}',${n})">★</button>`,
        )
        .join("");
    }
    // Persist to Firestore
    if (window.PaletteDB) {
      window.PaletteDB.setRating(this._activeConfig.type, title, val);
    }
  },

  _toggleLike() {
    const cfg = this._activeConfig;
    cfg.liked = !cfg.liked;
    if (cfg.onLike) cfg.onLike(cfg.liked);
    const btn = document.getElementById("pp-like-btn");
    if (btn) {
      btn.classList.toggle("pp-like-btn--liked", cfg.liked);
      btn.innerHTML = `${cfg.liked ? "♥" : "♡"} Like`;
    }
    // Persist to Firestore
    if (window.PaletteDB) {
      window.PaletteDB.setLiked(cfg.type, cfg.title, cfg.liked);
    }
  },

  _addToLogbook() {
    const btn = document.querySelector(".pp-logbook-btn");
    if (btn) {
      btn.textContent = "✓ Added!";
      btn.style.background = "#4caf50";
      setTimeout(() => {
        btn.textContent = "+ Add to Logbook";
        btn.style.background = "";
      }, 1800);
    }
  },

  close() {
    document.getElementById("palette-popup-overlay").style.display = "none";
    this._activeConfig = null;
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

(function patchLettersCarousel() {
  const _original = PaletteCollection.prototype.buildCarousel;

  // Tilt angles for the subtle "scattered letters" look.
  // Cycles through this list so cards always get a consistent tilt.
  const TILTS = [-2.5, 1.8, -1.2, 2.2, -1.8, 1.4, -2.0, 1.6];

  // Stamp emoji variety
  const STAMPS = ["🌸", "✦", "☁️", "🌿", "★", "♡", "🕊️", "🍃"];

  PaletteCollection.prototype.buildCarousel = function () {
    if (this.type !== "letters") {
      return _original.call(this);
    }

    const grid = document.getElementById("letters-grid");
    if (!grid) return;

    grid.innerHTML = this.items
      .map((item, index) => {
        const tilt = TILTS[index % TILTS.length];
        const stamp = STAMPS[index % STAMPS.length];

        return `
        <div class="envelope-card"
             style="transform: rotate(${tilt}deg);"
             onclick="PaletteCollection.getInstance('letters').openLetterPopup(${index})">
 
          <div class="envelope-body">
 
            <!-- Flap -->
            <div class="envelope-flap"></div>
 
            <!-- Stamp -->
            <div class="envelope-stamp" aria-hidden="true">${stamp}</div>
 
            <!-- Postmark -->
            <div class="envelope-postmark" aria-hidden="true">
              palette<br>★<br>post
            </div>
 
            <!-- Wax seal -->
            <div class="envelope-seal" aria-hidden="true">✦</div>
 
            <!-- Fold lines -->
            <div class="envelope-folds" aria-hidden="true"></div>
 
            <!-- Content -->
            <div class="envelope-content">
              <p class="envelope-title">${item.title}</p>
              <p class="envelope-excerpt">${item.excerpt || item.description.slice(0, 120) + "…"}</p>
              <div class="envelope-footer">
                <span class="envelope-date">${item.date}</span>
                <button class="envelope-heart ${item.liked ? "liked" : ""}"
                        onclick="event.stopPropagation();
                                 PaletteCollection.getInstance('letters').toggleLike(event, ${index})"
                        aria-label="Like">
                  ${item.liked ? "♥" : "♡"}
                </button>
              </div>
            </div>
 
          </div>
        </div>`;
      })
      .join("");
  };
})();

// ── Patch 2: updateTrackPosition — letters uses CSS grid, not transform ──
(function patchLettersTrackPosition() {
  const _original = PaletteCollection.prototype.updateTrackPosition;

  PaletteCollection.prototype.updateTrackPosition = function () {
    if (this.type === "letters") return; // grid layout — no transform needed
    return _original.call(this);
  };
})();

// ── Patch 3: slide — letters has no carousel to slide ──────────
(function patchLettersSlide() {
  const _original = PaletteCollection.prototype.slide;

  PaletteCollection.prototype.slide = function (direction) {
    if (this.type === "letters") return; // no-op for grid
    return _original.call(this, direction);
  };
})();

// ── Custom method: openLetterPopup ─────────────────────────────
// Adds a brief "envelope opening" flash then delegates to the
// existing PalettePopup.open() with exactly the same config shape
// all other types use. No changes to PalettePopup itself.

PaletteCollection.prototype.openLetterPopup = function (index) {
  const card = document.querySelectorAll(".envelope-card")[index];

  // Quick visual "open" pulse on the clicked card
  if (card) {
    card.style.transition = "transform 0.18s ease";
    card.style.transform = "scale(1.06) rotate(0deg)";
    setTimeout(() => {
      card.style.transform = "";
    }, 260);
  }

  // Delegate to standard openPopup after the micro-animation
  setTimeout(() => {
    this.openPopup(index);
  }, 180);
};

(function patchLettersCarousel() {
  /* ── buildCarousel: render envelopes into the track ── */
  const _origBuild = PaletteCollection.prototype.buildCarousel;
  PaletteCollection.prototype.buildCarousel = function () {
    if (this.type !== "letters") return _origBuild.call(this);

    const track = document.getElementById(this.trackId);
    if (!track) return;

    const stamps = ["🌸", "✉️", "🌿", "☁️", "🕊️", "★", "♡", "🌙"];

    track.innerHTML = this.items
      .map((item, index) => {
        const tilt = (index % 2 === 0 ? 1 : -1) * (1 + (index % 3));
        const stamp = stamps[index % stamps.length];

        return `
        <div class="envelope-card"
             style="transform: rotate(${tilt}deg);"
             onclick="PaletteCollection.getInstance('letters').openLetterPopup(${index})">
          <div class="envelope-body">
            <div class="envelope-flap"></div>
            <div class="envelope-stamp" aria-hidden="true">${stamp}</div>
            <div class="envelope-postmark" aria-hidden="true">palette<br>★<br>post</div>
            <div class="envelope-seal" aria-hidden="true">✦</div>
            <div class="envelope-content">
              <p class="envelope-title">${item.title}</p>
              <p class="envelope-excerpt">${item.excerpt || item.description.slice(0, 100) + "…"}</p>
              <div class="envelope-footer">
                <span class="envelope-date">${item.date}</span>
                <button class="envelope-heart ${item.liked ? "liked" : ""}"
                        onclick="event.stopPropagation();
                                 PaletteCollection.getInstance('letters').toggleLike(event, ${index})"
                        aria-label="Like">
                  ${item.liked ? "♥" : "♡"}
                </button>
              </div>
            </div>
          </div>
        </div>`;
      })
      .join("");
  };

  /* ── updateTrackPosition: pixel-scroll the flex track ── */
  const _origUpdate = PaletteCollection.prototype.updateTrackPosition;
  PaletteCollection.prototype.updateTrackPosition = function () {
    if (this.type !== "letters") return _origUpdate.call(this);

    const track = document.getElementById(this.trackId);
    if (!track) return;
    /* 220px card + 20px gap */
    track.style.transform = `translateX(-${this.currentIndex * 240}px)`;
  };

  /* ── slide: clamp to letters item count ── */
  const _origSlide = PaletteCollection.prototype.slide;
  PaletteCollection.prototype.slide = function (dir) {
    if (this.type !== "letters") return _origSlide.call(this, dir);

    const visibleApprox = Math.floor(
      (document.querySelector(".letters-track-outer")?.clientWidth || 900) /
        240,
    );
    const max = Math.max(0, this.items.length - visibleApprox);
    this.currentIndex = Math.max(0, Math.min(this.currentIndex + dir, max));
    this.updateTrackPosition();
  };
})();

PaletteCollection.prototype.openLetterPopup = function (index) {
  /* quick scale pulse on the clicked card */
  const cards = document.querySelectorAll("#letters-track .envelope-card");
  const card = cards[index];
  if (card) {
    card.style.transition = "transform 0.18s ease";
    card.style.transform = "scale(1.07) rotate(0deg)";
    setTimeout(() => {
      card.style.transform = "";
    }, 260);
  }

  /* open the letter-paper popup after the animation */
  setTimeout(() => {
    LetterPopup.open(this.items[index], index, this);
  }, 180);
};

const LetterPopup = {
  _reviews: {}, // keyed by item.id
  _pickedRating: 0,
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
      window.PaletteDB.getItemData('letters', item.title).then((data) => {
        // Update rating display
        if (data.rating && data.rating !== (item.rating || 0)) {
          item.rating = data.rating;
          if (instance) instance.items[index].rating = data.rating;
          const ratingEl = overlay.querySelector('.letter-popup-rating');
          if (ratingEl) {
            ratingEl.innerHTML = [1, 2, 3, 4, 5]
              .map((i) => `<span class="${i <= data.rating ? "" : "off"}">★</span>`)
              .join('');
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
      window.PaletteDB.addReview('letters', this._activeItem.title, review);
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
      window.PaletteDB.setLiked('letters', item.title, item.liked);
    }
  },

  _addToLogbook() {
    const btn = document.querySelector(".letter-logbook-btn");
    if (!btn) return;
    btn.textContent = "✓ Added!";
    btn.style.background = "#4caf50";
    setTimeout(() => {
      btn.textContent = "+ Add to Logbook";
      btn.style.background = "";
    }, 1800);
  },

  close() {
    document.getElementById("palette-popup-overlay").style.display = "none";
    this._activeItem = null;
    this._activeInst = null;
    this._activeIndex = null;
  },
};

(function patchLettersSheet() {
  const _origRenderGrid = PaletteSheet.renderGrid.bind(PaletteSheet);

  PaletteSheet.renderGrid = function () {
    const inst = this.activeInstance;
    if (!inst || inst.type !== "letters") return _origRenderGrid();

    const container = document.getElementById("sheet-grid-container");
    if (!container) return;

    /* Override the grid class to the letters flex layout */
    container.className = "letters-sheet-grid";

    const stamps = ["🌸", "✉️", "🌿", "☁️", "🕊️", "★", "♡", "🌙"];

    container.innerHTML = inst.items
      .map((item, idx) => {
        const matchGenre =
          inst.activeFilter === "all" || item.genre === inst.activeFilter;
        const matchQuery =
          !inst.searchQuery ||
          item.title.toLowerCase().includes(inst.searchQuery) ||
          item.excerpt?.toLowerCase().includes(inst.searchQuery);
        if (!(matchGenre && matchQuery)) return "";

        const tilt = (idx % 2 === 0 ? 1 : -1) * (1 + (idx % 3));
        const stamp = stamps[idx % stamps.length];

        return `
        <div class="envelope-card"
             style="transform: rotate(${tilt}deg);"
             onclick="PaletteCollection.getInstance('letters').openLetterPopup(${idx})">
          <div class="envelope-body">
            <div class="envelope-flap"></div>
            <div class="envelope-stamp">${stamp}</div>
            <div class="envelope-postmark">palette<br>★<br>post</div>
            <div class="envelope-seal">✦</div>
            <div class="envelope-content">
              <p class="envelope-title">${item.title}</p>
              <p class="envelope-excerpt">${item.excerpt || item.description.slice(0, 100) + "…"}</p>
              <div class="envelope-footer">
                <span class="envelope-date">${item.date}</span>
                <button class="envelope-heart ${item.liked ? "liked" : ""}"
                        onclick="event.stopPropagation();
                                 PaletteCollection.getInstance('letters').toggleLike(null, ${idx})"
                        aria-label="Like">${item.liked ? "♥" : "♡"}</button>
              </div>
            </div>
          </div>
        </div>`;
      })
      .join("");
  };
})();

/* ── BOOTSTRAP ── */
const MusicEngine = new PaletteCollection({
  type: "music",
  endpoint: "Discover/data/songs.json",
  badgeImg: "Discover/images/spotify-logo.png",
  trackId: "music-track",
  badgeLabel: "SPOTIFY",
  badgeColor: "#1db954",
  imgPlaceholder: "♪",
  sheetTitle: "★ soundwaves & sentiments",
  searchPlaceholder: "search songs...",
  filters: [
    {
      label: "All",
      value: "all",
    },
    {
      label: "Pop",
      value: "pop",
    },
    {
      label: "Indie",
      value: "indie",
    },
  ],
});

const BookEngine = new PaletteCollection({
  type: "books",
  endpoint: "Discover/data/books.json",
  badgeImg: "Discover/images/goodreads-logo.png", // Update path if needed
  trackId: "books-track",
  badgeLabel: "GOODREADS",
  badgeColor: "#8a6d53",
  imgPlaceholder: "📚",
  sheetTitle: "★ stories and spines library",
  searchPlaceholder: "search books...",
  filters: [
    {
      label: "All",
      value: "all",
    },
    {
      label: "Fiction",
      value: "fiction",
    },
    {
      label: "Sci-Fi",
      value: "scifi",
    },
  ],
});

const MovieEngine = new PaletteCollection({
  type: "movies",
  endpoint: "Discover/data/movies.json",
  badgeImg: "",
  trackId: "movies-track",
  badgeLabel: "LETTERBOXD",
  badgeColor: "#00c030",
  imgPlaceholder: "🎬",
  sheetTitle: "★ frames & feelings — all films",
  searchPlaceholder: "search films...",
  visibleCount: 5,
  filters: [
    {
      label: "All",
      value: "all",
    },
    {
      label: "Romance",
      value: "romance",
    },
    {
      label: "Drama",
      value: "drama",
    },
    {
      label: "Thriller",
      value: "thriller",
    },
    {
      label: "Animation",
      value: "animation",
    },
    {
      label: "Comedy",
      value: "comedy",
    },
  ],
});

const ArtEngine = new PaletteCollection({
  type: "art",
  endpoint: "Discover/data/art.json", // ← adjust path to match your project
  badgeImg: "",
  trackId: "art-track",
  badgeLabel: "GALLERY",
  badgeColor: "#5a3060",
  imgPlaceholder: "🖼️",
  sheetTitle: "★ pigments & poetry — full gallery",
  searchPlaceholder: "search artworks...",
  visibleCount: 4, // used only by slide() max-offset calc; actual stepping is pixel-based
  filters: [
    {
      label: "All",
      value: "all",
    },
    {
      label: "Impressionism",
      value: "impressionism",
    },
    {
      label: "Post-Impressionism",
      value: "post-impressionism",
    },
    {
      label: "Surrealism",
      value: "surrealism",
    },
    {
      label: "Renaissance",
      value: "renaissance",
    },
    {
      label: "Baroque",
      value: "baroque",
    },
    {
      label: "Ukiyo-e",
      value: "ukiyo-e",
    },
  ],
});

const LettersEngine = new PaletteCollection({
  type: "letters",
  endpoint: "Discover/data/letters.json",
  badgeImg: "",
  trackId: "letters-track",
  badgeLabel: "JOURNAL",
  badgeColor: "#8a6a4a",
  imgPlaceholder: "✉️",
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

// ============================================================
//  API OVERRIDES
//  Books → Open Library  |  Art → Art Institute of Chicago
//  Films → TMDB (set TMDB_API_KEY below; falls back to movies.json)
// ============================================================

// ── TMDB key ─────────────────────────────────────────────────
// Paste your key from https://www.themoviedb.org/settings/api
// Leave as '' to fall back to the local movies.json file.
const TMDB_API_KEY = "";

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

    const SUBJECT_GENRE_MAP = {
      fiction: "fiction",
      science_fiction: "scifi",
      romance: "romance",
      thriller: "thriller",
      mystery: "mystery",
    };

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
    console.error("[BOOKS] API error — falling back to local JSON:", err);
    // Graceful fallback
    try {
      const res = await fetch(this.endpoint);
      this.items = await res.json();
      this.buildCarousel();
    } catch (e) {
      console.error("[BOOKS] Fallback also failed:", e);
    }
  }
};

// ============================================================
//  ART — Art Institute of Chicago  (broad paginated fetch)
// ============================================================

ArtEngine.initialize = async function () {
  const PAGES = 3; // 3 × 20 = up to 60 artworks
  const LIMIT = 20;
  const FIELDS =
    "id,title,artist_display,date_display,medium_display," +
    "artwork_type_title,place_of_origin,image_id," +
    "style_titles,dimensions,credit_line,is_public_domain";

  try {
    const pageResults = await Promise.all(
      Array.from({ length: PAGES }, (_, i) =>
        fetch(
          `https://api.artic.edu/api/v1/artworks` +
            `?page=${i + 1}&limit=${LIMIT}&fields=${FIELDS}`,
        ).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        }),
      ),
    );

    const iiifBase =
      pageResults[0]?.config?.iiif_url || "https://www.artic.edu/iiif/2";

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
    console.error("[ART] API error — falling back to local JSON:", err);
    try {
      const res = await fetch(this.endpoint);
      this.items = await res.json();
      this.buildCarousel();
    } catch (e) {
      console.error("[ART] Fallback also failed:", e);
    }
  }
};

// ============================================================
//  FILMS — TMDB  (broad popular fetch, full genre map)
// ============================================================

MovieEngine.initialize = async function () {
  if (!TMDB_API_KEY) {
    console.warn("[FILMS] No TMDB key — falling back to local movies.json.");
    try {
      const res = await fetch(this.endpoint);
      this.items = await res.json();
      this.buildCarousel();
    } catch (e) {
      console.error("[FILMS] Fallback also failed:", e);
    }
    return;
  }

  const BASE = "https://api.themoviedb.org/3";
  const PAGES = 3; // 3 × 20 = up to 60 films

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
    28: "drama", // Action
    12: "drama", // Adventure
    14: "drama", // Fantasy
    27: "thriller", // Horror
    9648: "thriller", // Mystery
    878: "drama", // Sci-Fi
    10752: "drama", // War
    37: "drama", // Western
    80: "thriller", // Crime
    99: "drama", // Documentary
    36: "drama", // History
    10402: "drama", // Music
    10770: "drama", // TV Movie
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
          { label: "Language", value: film.original_language },
          { label: "TMDB ID", value: film.id },
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
    console.error(
      "[FILMS] API error — falling back to local movies.json:",
      err,
    );
    try {
      const res = await fetch(this.endpoint);
      this.items = await res.json();
      this.buildCarousel();
    } catch (e) {
      console.error("[FILMS] Fallback also failed:", e);
    }
  }
};

// ============================================================
//  BOOTSTRAP — initialise all engines
// ============================================================

MusicEngine.initialize(); // loads from songs.json (unchanged)
BookEngine.initialize(); // ← Open Library API
MovieEngine.initialize(); // ← TMDB API (or movies.json fallback)
ArtEngine.initialize(); // ← Art Institute of Chicago API
LettersEngine.initialize(); // loads from letters.json (unchanged)

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

  /* Letter stamp decoration — cycles per card */
  const STAMPS = ["🌸", "✉️", "🌿", "☁️", "🕊️", "★", "♡", "🌙"];

  /* ── Fisher-Yates shuffle (in-place) ── */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ── Wait for all engines to have loaded items ──
     Each engine's initialize() is async; we poll until every
     engine has at least one item or 8 seconds pass.            */
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
      /* Letter-paper popup */
      const item = inst.items[originalIndex];

      /* Quick scale pulse (mimics openLetterPopup) */
      /* No reliable DOM reference here, so skip the pulse — popup opens immediately */
      LetterPopup.open(item, originalIndex, inst);
    } else {
      /* Standard PalettePopup via existing openPopup() */
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
      /* Spin animation on the button icon */
      const btn = document.querySelector(".mp-refresh-btn");
      if (btn) {
        btn.classList.add("spinning");
        setTimeout(() => btn.classList.remove("spinning"), 520);
      }
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