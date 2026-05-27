// ============================================================
//  firebase.js  —  Palette × Firestore integration
//  Load this BEFORE discoveruifx.js (as type="module").
//  Exposes window.PaletteDB so non-module scripts can call it.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-analytics.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ── Firebase config ─────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyD-UrouBNyAknf6JXlh2guSG64AslirDrA",
  authDomain: "palette-cmsc126.firebaseapp.com",
  projectId: "palette-cmsc126",
  storageBucket: "palette-cmsc126.firebasestorage.app",
  messagingSenderId: "215920491803",
  appId: "1:215920491803:web:b503ee8f38f493a70967be",
  measurementId: "G-WKGQLNCP1X",
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// ── Helpers ──────────────────────────────────────────────────

/**
 * Build a stable, Firestore-safe document ID from content type + title.
 * e.g.  music_pink_pony_club
 */
function docId(type, title) {
  return `${type}_${title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`;
}

/**
 * Return the Firestore document reference for one palette item.
 * Collection: "palette_interactions"
 */
function itemRef(type, title) {
  return doc(db, "palette_interactions", docId(type, title));
}

// ── Public API (attached to window so non-module JS can use it) ──

window.PaletteDB = {
  // ── READ: fetch one item's interaction data ──────────────
  // Returns { liked, rating, reviews } or defaults if not yet saved.
  async getItemData(type, title) {
    try {
      const snap = await getDoc(itemRef(type, title));
      if (snap.exists()) {
        const d = snap.data();
        return {
          liked: d.liked ?? false,
          rating: d.rating ?? 0,
          reviews: d.reviews ?? [],
        };
      }
    } catch (err) {
      console.warn("[PaletteDB] getItemData error:", err);
    }
    return { liked: false, rating: 0, reviews: [] };
  },

  // ── READ: bulk-fetch all saved interactions ───────────────
  // Returns a Map keyed by  docId (type_sanitizedTitle).
  // Used at engine boot to hydrate items without per-item round-trips.
  // Note: Firestore doesn't have a "list all" without a query, so we
  // rely on per-item loads triggered when popups open, and a lightweight
  // in-memory cache so subsequent opens are instant.
  _cache: {},

  async prefetchItems(type, items) {
    // Fire all reads in parallel; silently cache results.
    await Promise.allSettled(
      items.map(async (item) => {
        const key = docId(type, item.title);
        if (this._cache[key]) return; // already cached
        const data = await this.getItemData(type, item.title);
        this._cache[key] = data;
        // Apply immediately to the live item object
        item.liked = data.liked;
        item.rating = data.rating;
      }),
    );
  },

  // ── WRITE: persist liked state ───────────────────────────
  async setLiked(type, title, liked) {
    const key = docId(type, title);
    try {
      await setDoc(itemRef(type, title), { liked }, { merge: true });
      if (this._cache[key]) this._cache[key].liked = liked;
    } catch (err) {
      console.warn("[PaletteDB] setLiked error:", err);
    }
  },

  // ── WRITE: persist star rating ───────────────────────────
  async setRating(type, title, rating) {
    const key = docId(type, title);
    try {
      await setDoc(itemRef(type, title), { rating }, { merge: true });
      if (this._cache[key]) this._cache[key].rating = rating;
    } catch (err) {
      console.warn("[PaletteDB] setRating error:", err);
    }
  },

  // ── WRITE: append a new review ───────────────────────────
  // review = { user, text, rating }
  async addReview(type, title, review) {
    const key = docId(type, title);
    const withStamp = { ...review, timestamp: new Date().toISOString() };
    try {
      await setDoc(
        itemRef(type, title),
        { reviews: arrayUnion(withStamp) },
        { merge: true },
      );
      if (this._cache[key]) {
        this._cache[key].reviews = [
          withStamp,
          ...(this._cache[key].reviews || []),
        ];
      }
    } catch (err) {
      console.warn("[PaletteDB] addReview error:", err);
    }
  },

  // ── READ: get reviews for a popup (uses cache-first) ─────
  async getReviews(type, title) {
    const key = docId(type, title);
    if (this._cache[key]) return [...this._cache[key].reviews];
    const data = await this.getItemData(type, title);
    this._cache[key] = data;
    return [...data.reviews];
  },

  // ── READ: get rating (cache-first) ───────────────────────
  async getRating(type, title) {
    const key = docId(type, title);
    if (this._cache[key]) return this._cache[key].rating;
    const data = await this.getItemData(type, title);
    this._cache[key] = data;
    return data.rating;
  },
};

console.log("[PaletteDB] Firestore ready");
