//import firestore db
import {db} from "./firebase.js";
import{ formatDate, formatTime, getMiniText} from "./helpers.js";

//import firebase functions
import{
    doc,
    getDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";


//temp user id
const currentUserId = "YEuX9j21SCA08FPVEkux"

const tmdbApiKey = "YOUR_TMDB_API_KEY";

//gets profile elements from html
const profilePicture = document.getElementById("profile-picture");
const profileName = document.getElementById("profile-name");
const profileUsername = document.getElementById("profile-username");
const profileBio = document.getElementById("profile-bio");
const joinedText = document.getElementById("joined-text");
const filmCount = document.getElementById("film-count");
const bookCount = document.getElementById("book-count");
const entryCount = document.getElementById("entry-count");
const currentTrackTitle = document.getElementById("current-track-title");
const currentTrackMeta = document.getElementById("current-track-meta");
const favoritesTrack = document.getElementById("favorites-track");
const recosTrack = document.getElementById("recos-track");
const notesList = document.getElementById("notes-list");
const pinnedProfilePicture = document.getElementById("pinned-post-profile");
const pinnedUsername = document.getElementById("pinned-username");
const pinnedType = document.getElementById("pinned-type");
const pinnedDate = document.getElementById("pinned-date");
const pinnedTime = document.getElementById("pinned-time");
const pinnedBody = document.getElementById("pinned-body");
const bookmarkWatchList = document.getElementById("bookmark-watch-list");
const bookmarkReadList = document.getElementById("bookmark-read-list");
const bookmarkListenList = document.getElementById("bookmark-listen-list");

let editBookmarks = {
    toWatch: [],
    toRead: [],
    toListen: []
};

//loads profile
loadProfile();

async function loadProfile(){
    const userRef = doc(db, "users", currentUserId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()){
        console.log("user doc not found");
        return;
    }

    

    const user = userSnap.data()
    editFavorites = user.favorites || [];
    editRecos = user.recommendations || [];
    editNotes = user.notes || [];
    renderCarousel(user.favorites || [], favoritesTrack);
    renderCarousel(user.recommendations || [], recosTrack);
    initCarousel("favorites-track");
    initCarousel("recos-track");
    renderNotes(user.notes || []);
    editBookmarks = user.bookmarks || {
        toWatch: [],
        toRead: [],
        toListen: []
    };
    renderBookmarks(editBookmarks);
    loadPinnedPost(user.pinnedPostId);
    

    profilePicture.src = user.profilePicture || "no-profile.png";
    profileName.textContent = user.name || "";
    profileUsername.textContent = "@" + (user.username || "");
    profileBio.textContent = user.bio || "";
    joinedText.textContent = "palette member since: " + formatDate(user.dateJoined);
    filmCount.textContent = user.filmCount || 0;
    bookCount.textContent = user.bookCount || 0;
    entryCount.textContent = user.entryCount || 0;
    currentTrackTitle.textContent = user.currentTrackTitle || "no song yet";
    currentTrackMeta.textContent = user.currentTrackMeta || "----"
    
    
    
}



async function removeBookmark(category, index){
    editBookmarks[category].splice(index, 1);

    renderBookmarks(editBookmarks);

    const userRef = doc(db, "users", currentUserId);

    await updateDoc(userRef, {
        bookmarks: editBookmarks
    });
}

// shows bookmark lists in the bookmark panel
function renderBookmarks(bookmarks){
    renderBookmarkList(bookmarks.toWatch || [], bookmarkWatchList, "toWatch");
    renderBookmarkList(bookmarks.toRead || [], bookmarkReadList, "toRead");
    renderBookmarkList(bookmarks.toListen || [], bookmarkListenList, "toListen");
}


// shows one bookmark category
function renderBookmarkList(items, container, category){
    container.innerHTML = "";

    if(items.length === 0){
        container.innerHTML = "<li>nothing saved yet</li>";
        return;
    }

    items.forEach(function(item, index){
        const li = document.createElement("li");

        const title = typeof item === "string"
            ? item
            : `${item.title} ${item.type ? "(" + item.type + ")" : ""}`;

        li.innerHTML = `
            <span>${title}</span>
            <button class="remove-bookmark-btn" type="button">&#10005;</button>
        `;

        const removeBtn = li.querySelector(".remove-bookmark-btn");

        removeBtn.addEventListener("click", function(){
            removeBookmark(category, index);
        });

        container.appendChild(li);
    });
}

//loads user pinned post
async function loadPinnedPost(pinnedPostId){
    if(!pinnedPostId){
        pinnedBody.innerHTML = "<p class='post-content'> no feature post here </p>";
        return;
    }

    const postRef = doc(db, "posts", pinnedPostId);
    const postSnap = await getDoc(postRef);

    if(!postSnap.exists()){
        pinnedBody.innerHTML = "<p class='post-content'>there is no pinned post.</p>";
        return;
    }

    const post = postSnap.data();

    pinnedProfilePicture.src = post.userProfilePicture || "no-profile.png";
    pinnedUsername.textContent = "@" + (post.username || "username");
    pinnedType.textContent = getMiniText(post);
    pinnedDate.textContent = formatDate(post.activityDate) || "";
    pinnedTime.textContent = formatTime(post.datePosted);

    pinnedBody.innerHTML=`
        <p class="post-content">
            ${post.body || "welp, there's no pinned post here"}
        </p>
    `;
}


function renderCarousel(items, track){
    track.innerHTML = "";

    if (items.length === 0){
        track.innerHTML = `
            <article class="postcard-slide">
                <div class="postcard-surface">
                    <p class="postcard-title"> ? </p>
                    <p class = "postcard-meta"> nope </p>
                </div>
            </article>
        `;
        return;
    }

    items.forEach(function(item){
        const slide = document.createElement("article");
        slide.className = "postcard-slide";

        slide.innerHTML = `
            <div class="postcard-surface">
                <div class="cover-placeholder">
                    <img src=${item.cover || "no-image.jpg"} alt="cover">
                </div>
                <p class="postcard-title">${item.title || "untitled"}</p>
                <p class="postcard-meta">${item.type || ""}</p>
           </div>
           `;

        track.appendChild(slide);
    });
}


//carousel buttons
function initCarousel(trackId){
    const track = document.getElementById(trackId);

    if(!track){
        return;
    }

    const carouselRoot = track.closest(".postcard-carousel");
    if(!carouselRoot){
        return;
    }
    const slides = track.querySelectorAll(".postcard-slide");
    const prevBtn = carouselRoot.querySelector(".prev-btn");
    const nextBtn = carouselRoot.querySelector(".next-btn");

    if(slides.length === 0 || !prevBtn || !nextBtn){
        return;
    }
    let current = 0;

    track.style.transform = "translateX(0%)";

    function goTo(index){
        current = (index +slides.length) % slides.length;
        track.style.transform = `translateX(-${current * 100}%)`;
    }
    
    prevBtn.onclick = function(){
        current = current - 1;

        if (current < 0){
            current = slides.length - 1;
        }

        track.style.transform =  `translateX(-${current * 100}%)`;
    };
    
    nextBtn.onclick = function(){
        current = current + 1;

        if (current >= slides.length){
            current = 0;
        }

        track.style.transform =  `translateX(-${current * 100}%)`;
    };
}

//show profile notes
function renderNotes(notes){
    notesList.innerHTML = "";

    if (notes.length === 0){
        notesList.innerHTML = "<li> hmm... </li>";
        return;
    }

    notes.forEach(function(note){
        const li = document.createElement("li");
        li.textContent = note;
        notesList.append(li);
    });
}

//edit profile

const editModal = document.getElementById("edit-modal");
const modalOverlay = document.getElementById("modal-overlay");
const openEditModalBtn = document.getElementById("open-edit-modal");
const closeEditModalBtn = document.getElementById("close-edit-modal");
const cancelEditModalBtn = document.getElementById("cancel-edit-modal");
const saveProfileChangesBtn = document.getElementById("save-profile-changes");

const editName = document.getElementById("edit-name");
const editUsername = document.getElementById("edit-username");
const editBio = document.getElementById("edit-bio");
const editCurrentTrackTitle = document.getElementById("edit-current-track-title");
const editCurrentTrackMeta = document.getElementById("edit-current-track-meta");

const searchModalInput = document.getElementById("search-modal-input");
const searchModalBtn = document.getElementById("search-modal-btn");
const searchModalResults = document.getElementById("search-modal-results");

const openFavoritesSearchBtn = document.getElementById("open-favorites-search");
const openRecosSearchBtn = document.getElementById("open-recos-search");

const searchModal = document.getElementById("search-modal");
const closeSearchModalBtn = document.getElementById("close-search-modal");
const searchModalTitle = document.getElementById("search-modal-title");

const editFavoritesList = document.getElementById("edit-favorites-list");
const editRecosList = document.getElementById("edit-recos-list");

const newNoteInput = document.getElementById("new-note-input");
const addNoteBtn = document.getElementById("add-note-btn");
const editNotesList = document.getElementById("edit-notes-list");

const editProfilePictureFile = document.getElementById("edit-profile-picture-file");
const editProfilePicturePreview = document.getElementById("edit-profile-picture-preview");


let currentSearchTarget = "";
let selectedProfilePictureDataUrl = "";

if (editProfilePictureFile) {
    editProfilePictureFile.addEventListener("change", function() {
        const file = editProfilePictureFile.files[0];

        if (!file) {
            return;
        }

        const reader = new FileReader();

        reader.onload = function(event) {
            selectedProfilePictureDataUrl = event.target.result;
            editProfilePicturePreview.src = selectedProfilePictureDataUrl;
        };

        reader.readAsDataURL(file);
    });
}




let editFavorites = [];
let editRecos = [];
let editNotes = [];


let searchTimer;

openFavoritesSearchBtn.addEventListener("click", function() {
    openSearchModal("favorites");
});

openRecosSearchBtn.addEventListener("click", function() {
    openSearchModal("recos");
});

closeSearchModalBtn.addEventListener("click", closeSearchModal);

searchModalBtn.addEventListener("click", function() {
    searchMixedMedia(searchModalInput.value, searchModalResults, currentSearchTarget);
});

searchModalInput.addEventListener("input", function() {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(function() {
        searchMixedMedia(searchModalInput.value, searchModalResults, currentSearchTarget);
    }, 800);
});

function openSearchModal(target) {
    currentSearchTarget = target;

    if (target === "favorites") {
        searchModalTitle.textContent = "add favorite";
    } else {
        searchModalTitle.textContent = "add recommendation";
    }

    searchModalInput.value = "";
    searchModalResults.innerHTML = "";
    searchModal.classList.add("open");
}

function closeSearchModal() {
    searchModal.classList.remove("open");
}

//searches books, movies, songs, etc
async function searchMixedMedia(searchText, resultsContainer, targetList){
    const query = searchText.trim();

    if (query.length < 3) {
        resultsContainer.innerHTML = "";
        return;
    }

    resultsContainer.innerHTML = "<p> searching, pls wait :p </p>";

    const [books, movies] = await Promise.all([
        searchBooks(query),
        searchMovies(query)
    ]);

    const allResults = [
        ...movies,
        ...books
    ];

    renderSearchResults(allResults, resultsContainer, targetList);
}

async function searchBooks(query){
    const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=4`;

    const response = await fetch(url);
    const data = await response.json();

    return data.docs.map(function(book){
        return{
            title: book.title || "untitled",
            type: "book",
            creator: book.author_name ? book.author_name[0] : "unknown author",
            year: book.first_publish_year || "",
            cover: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`: "no-image.jpg",
            source: "openlibrary",
            sourceId: book.key || ""
        };
    });
}

// TMDb API for movies
async function searchMovies(query){
    const url = `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=1`;

    const response = await fetch(url);
    const data = await response.json();

    return data.results.slice(0, 4).map(function(movie){
        return {
            title: movie.title || "untitled",
            type: "movie",
            creator: movie.release_date ? "TMDb" : "unknown",
            year: movie.release_date ? movie.release_date.slice(0, 4) : "",
            cover: movie.poster_path
                ? `https://image.tmdb.org/t/p/w342${movie.poster_path}`
                : "no-image.jpg",
            source: "tmdb",
            sourceId: movie.id || ""
        };
    });
}

function renderSearchResults(results, container, targetList){
    container.innerHTML = "";

    if(results.length === 0){
        container.innerHTML = "<p> no results found :( </p>";
        return;
    }

    results.forEach(function(item) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "search-result-card";

        card.innerHTML = `
            <img src="${item.cover}" alt="cover">
            
            <div>
                <p>${item.title}</p>
                <p>${item.type} • ${item.creator}${item.year ? " • " + item.year : ""}</p>
            </div>
        `;

        card.addEventListener("click", function() {
            if (targetList === "favorites") {
                const alreadyExists = editFavorites.some(function(fave) {
                    return fave.sourceId === item.sourceId && fave.type === item.type;
                });

                if (!alreadyExists) {
                    editFavorites.push(item);
                }

                renderEditChosenItems(editFavorites, editFavoritesList, "favorites");
        }

        if (targetList === "recos") {
            const alreadyExists = editRecos.some(function(reco) {
                return reco.sourceId === item.sourceId && reco.type === item.type;
            });

            if (!alreadyExists) {
                editRecos.push(item);
            }

            renderEditChosenItems(editRecos, editRecosList, "recos");
        }

       searchModalInput.value = "";
        searchModalResults.innerHTML = "";
        closeSearchModal();
    });

    container.appendChild(card);
});
}

function openEditModal() {
    fillEditModalFromProfile();

    editModal.classList.add("open");
    modalOverlay.classList.add("visible");
    document.body.classList.add("edit-modal-open");
}

function closeEditModal() {
    editModal.classList.remove("open");
    modalOverlay.classList.remove("visible");
    document.body.classList.remove("edit-modal-open");
}

function fillEditModalFromProfile() {
    editName.value = profileName.textContent || "";
    editUsername.value = profileUsername.textContent.replace("@", "") || "";
    editBio.value = profileBio.textContent || "";
    editProfilePicturePreview.src = profilePicture.src || "no-profile.png";
    editCurrentTrackTitle.value = currentTrackTitle.textContent || "";
    editCurrentTrackMeta.value = currentTrackMeta.textContent || "";

    
    renderEditChosenItems(editFavorites, editFavoritesList, "favorites");
    renderEditChosenItems(editRecos, editRecosList, "recos");
    renderEditNotes();
}



function renderEditChosenItems(items, container, targetList) {
    container.innerHTML = "";

    items.forEach(function(item, index) {
        const chip = document.createElement("div");
        chip.className = "chosen-chip";

        chip.innerHTML = `
            <div>
                <p class="chosen-title">${item.title}</p>
                <p class="chosen-meta">${item.type}</p>
            </div>
            <button class="remove-item-btn" type="button">&#10005;</button>
        `;

        const removeBtn = chip.querySelector(".remove-item-btn");

        removeBtn.addEventListener("click", function() {
            items.splice(index, 1);

            if (targetList === "favorites") {
                renderEditChosenItems(editFavorites, editFavoritesList, "favorites");
            } else {
                renderEditChosenItems(editRecos, editRecosList, "recos");
            }
        });

        container.appendChild(chip);
    });
}

function renderEditNotes() {
    editNotesList.innerHTML = "";

    editNotes.forEach(function(note, index) {
        const noteCard = document.createElement("div");
        noteCard.className = "note-edit-card";

        noteCard.innerHTML = `
            <span>${note}</span>
            <button class="remove-item-btn" type="button">&#10005;</button>
        `;

        const removeBtn = noteCard.querySelector(".remove-item-btn");

        removeBtn.addEventListener("click", function() {
            editNotes.splice(index, 1);
            renderEditNotes();
        });

        editNotesList.appendChild(noteCard);
    });
}

addNoteBtn.addEventListener("click", function() {
    const noteText = newNoteInput.value.trim();

    if (noteText === "") {
        return;
    }

    editNotes.push(noteText);
    newNoteInput.value = "";
    renderEditNotes();
});

if (saveProfileChangesBtn) {
    saveProfileChangesBtn.addEventListener("click", async function() {
        console.log("save button clicked");

        const userRef = doc(db, "users", currentUserId);

        const profilePictureUrl = selectedProfilePictureDataUrl || profilePicture.src;
        
        await updateDoc(userRef, {
            name: editName.value,
            username: editUsername.value,
            bio: editBio.value,
            profilePicture: profilePictureUrl,
            currentTrackTitle: editCurrentTrackTitle.value,
            currentTrackMeta: editCurrentTrackMeta.value,
            favorites: editFavorites,
            recommendations: editRecos,
            notes: editNotes
        });
        
        profileName.textContent = editName.value;
        profileUsername.textContent = "@" + editUsername.value;
        profileBio.textContent = editBio.value;
        profilePicture.src = profilePictureUrl;
        currentTrackTitle.textContent = editCurrentTrackTitle.value;
        currentTrackMeta.textContent = editCurrentTrackMeta.value;

        renderCarousel(editFavorites, favoritesTrack);
        renderCarousel(editRecos, recosTrack);
        initCarousel("favorites-track");
        initCarousel("recos-track");
        renderNotes(editNotes);

        closeEditModal();
    });
}

openEditModalBtn.addEventListener("click", openEditModal);
closeEditModalBtn.addEventListener("click", closeEditModal);
cancelEditModalBtn.addEventListener("click", closeEditModal);
modalOverlay.addEventListener("click", closeEditModal);


    const vinylToggle = document.getElementById('vinyl-toggle');
    const vinylRecord = document.querySelector('.vinyl-record');

    function toggleVinylSpin() {
        vinylRecord.classList.toggle('spinning');
    }

    vinylToggle.addEventListener('click', toggleVinylSpin);
    vinylToggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleVinylSpin();
        }
    });

    const bookmarkPanel = document.getElementById('bookmark-panel');
    const bookmarkOverlay = document.getElementById('bookmark-overlay');
    const openBookmarksBtn = document.getElementById('open-bookmarks');
    const closeBookmarksBtn = document.getElementById('close-bookmarks');

    function openBookmarks() {
        bookmarkPanel.classList.add('open');
        bookmarkOverlay.classList.add('visible');
    }

    function closeBookmarks() {
        bookmarkPanel.classList.remove('open');
        bookmarkOverlay.classList.remove('visible');
    }

    openBookmarksBtn.addEventListener('click', openBookmarks);
    closeBookmarksBtn.addEventListener('click', closeBookmarks);
    bookmarkOverlay.addEventListener('click', closeBookmarks);