//import firestore db
import {db, auth} from "../firebase.js";
import{ formatDate, formatTime, getMiniText} from "/scripts/helpers.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";


//import firebase functions
import{
    doc,
    getDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

let currentUserId = null;
let currentUserData = null;


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

const notesList = document.getElementById("notes-list");
const pinnedProfilePicture = document.getElementById("pinned-post-profile");
const pinnedUsername = document.getElementById("pinned-username");
const pinnedType = document.getElementById("pinned-type");
const pinnedDate = document.getElementById("pinned-date");
const pinnedTime = document.getElementById("pinned-time");
const pinnedBody = document.getElementById("pinned-body");


onAuthStateChanged(auth, async function(user) {
    if (!user) {
        window.location.href = "log-in.html";
        return;
    }

    currentUserId = user.uid;

    await loadProfile(currentUserId);
});

async function loadProfile(currentUserId){
    const userRef = doc(db, "users", currentUserId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()){
        console.log("user doc not found");
        return;
    }

    

    const user = userSnap.data()
    pinnedPostId = user.pinnedPostId || "";
    editFavorites = user.favorites || [];
    editNotes = user.notes || [];
    renderCarousel(user.favorites || [], favoritesTrack);
    initCarousel("favorites-track");
    renderNotes(user.notes || []);
    await loadPinnedPost(pinnedPostId);
    

    profilePicture.src = user.profilePicture || "/assets/images/no-profile.png";
    profileName.textContent = user.name || "";
    profileUsername.textContent = "@" + (user.username || "");
    profileBio.textContent = user.bio || "";
    joinedText.textContent = "palette member since: " + formatDate(user.dateJoined);
    filmCount.textContent = user.filmCount || 0;
    bookCount.textContent = user.bookCount || 0;
    entryCount.textContent = user.entryCount || 0;
    currentTrackTitle.textContent = user.currentTrackTitle || "no song yet";
    currentTrackMeta.textContent = user.currentTrackMeta || "----";

    selectedCurrentTrack = {
        title: user.currentTrackTitle || "",
        meta: user.currentTrackMeta || "",
        previewUrl: user.currentTrackPreviewUrl || "",
        cover: user.currentTrackCover || ""
    };
    
    
}


async function searchItunesTracks(searchText){
    const query = searchText.trim();

    if (query.length < 2){
        itunesSearchResults.innerHTML = "";
        return;
    }

    itunesSearchResults.innerHTML = "<p>searching songs...</p>";

    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=8`;

        const response = await fetch(url);
        const data = await response.json();

        renderItunesResults(data.results || []);
    } catch(error) {
        console.error("itunes search failed:", error);
        itunesSearchResults.innerHTML = "<p>failed to search songs :(</p>";
    }
}

function renderItunesResults(tracks){
    itunesSearchResults.innerHTML = "";

    if (tracks.length === 0){
        itunesSearchResults.innerHTML = "<p>no songs found</p>";
        return;
    }

    tracks.forEach(function(track){
        const card = document.createElement("button");
        card.type = "button";
        card.className = "search-result-card";

        const title = track.trackName || "untitled";
        const artist = track.artistName || "unknown artist";
        const album = track.collectionName || "";
        const cover = track.artworkUrl100 || "no-image.jpg";
        const previewUrl = track.previewUrl || "";

        card.innerHTML = `
            <img src="${cover}" alt="album cover">

            <div>
                <p>${title}</p>
                <p>${artist}${album ? " • " + album : ""}</p>
            </div>
        `;

        card.addEventListener("click", function(){
            console.log("selected preview:", previewUrl);

            selectedCurrentTrack = {
                title: title,
                meta: album ? `${artist} • ${album}` : artist,
                previewUrl: previewUrl,
                cover: cover
            };

            editCurrentTrackTitle.value = selectedCurrentTrack.title;
            editCurrentTrackMeta.value = selectedCurrentTrack.meta;

            itunesSearchResults.innerHTML = "";
        });

        itunesSearchResults.appendChild(card);
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

    pinnedProfilePicture.src = post.userProfilePicture || "/assets/images/no-profile.png";
    pinnedUsername.textContent = "@" + (post.username || "username");
    pinnedType.textContent = getMiniText(post);
    pinnedDate.textContent = post.datePosted ? formatDate(post.datePosted) : "";
    pinnedTime.textContent = formatTime(post.datePosted);

    pinnedBody.innerHTML = `
        <p class="post-content">
            ${post.body || "welp, there's no pinned post here"}
        </p>

        ${post.imageUrl ? `
            <div class="pinned-media-box">
                <img src="${post.imageUrl}" alt="pinned post image">
            </div>
    ` : ""}
`;
}


function renderCarousel(items, track){
    track.innerHTML = "";

    const totalSlots = Math.ceil(Math.max(items.length, 4) / 4) * 4;

    for (let i = 0; i < totalSlots; i += 4){
        const slide = document.createElement("article");
        slide.className = "postcard-slide";

        let slotHTML = "";

        for (let j = i; j < i + 4; j++){
            const item = items[j];

            if (item){
                slotHTML += `
                    <div class="favorite-slot">
                        <div class="cover-placeholder">
                            <img src="${item.cover || "/assets/images/no-image.jpg"}" alt="cover">
                        </div>
                        <p class="postcard-title">${item.title || "untitled"}</p>
                        <p class="postcard-meta">${item.type || ""}</p>
                    </div>
                `;
            } else {
                slotHTML += `
                    <div class="favorite-slot empty-favorite-slot">
                        <div class="cover-placeholder">
                            <p>empty</p>
                        </div>
                        <p class="postcard-title">favorite</p>
                        <p class="postcard-meta">empty slot</p>
                    </div>
                `;
            }
        }

        slide.innerHTML = `
            <div class="postcard-surface favorite-slide-grid">
                ${slotHTML}
            </div>
        `;

        track.appendChild(slide);
    }
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


const searchModal = document.getElementById("search-modal");
const closeSearchModalBtn = document.getElementById("close-search-modal");
const searchModalTitle = document.getElementById("search-modal-title");

const editFavoritesList = document.getElementById("edit-favorites-list");

const newNoteInput = document.getElementById("new-note-input");
const addNoteBtn = document.getElementById("add-note-btn");
const editNotesList = document.getElementById("edit-notes-list");

const editProfilePictureFile = document.getElementById("edit-profile-picture-file");
const editProfilePicturePreview = document.getElementById("edit-profile-picture-preview");

const itunesSearchInput = document.getElementById("itunes-search-input");
const itunesSearchBtn = document.getElementById("itunes-search-btn");
const itunesSearchResults = document.getElementById("itunes-search-results");

const removePinnedPostBtn = document.getElementById("remove-pinned-post-btn");

let selectedCurrentTrack = {
    title: "",
    meta: "",
    previewUrl: "",
    cover: ""
};
let pinnedPostId = "";
let currentAudio = null;
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

let editNotes = [];


let searchTimer;
let itunesSearchTimer;



if (itunesSearchBtn && itunesSearchInput) {
    itunesSearchBtn.addEventListener("click", function(){
        searchItunesTracks(itunesSearchInput.value);
    });

    itunesSearchInput.addEventListener("input", function(){
        clearTimeout(itunesSearchTimer);

        const value = itunesSearchInput.value.trim();

        if (value.length < 2){
            itunesSearchResults.innerHTML = "";
            return;
        }

        itunesSearchTimer = setTimeout(function(){
            searchItunesTracks(value);
        }, 350);
});
}

closeSearchModalBtn.addEventListener("click", closeSearchModal);

searchModalBtn.addEventListener("click", function() {
    searchMixedMedia(searchModalInput.value, searchModalResults, currentSearchTarget);
});

searchModalInput.addEventListener("input", function() {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(function() {
        searchMixedMedia(searchModalInput.value, searchModalResults, currentSearchTarget);
    }, 350);
});

if (removePinnedPostBtn) {
    removePinnedPostBtn.addEventListener("click", function() {
        pinnedPostId = "";
        pinnedBody.innerHTML = "<p class='post-content'>no featured post here</p>";
        pinnedDate.textContent = "";
        pinnedTime.textContent = "";
        pinnedType.textContent = "post";
    });
}

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
    editProfilePicturePreview.src = profilePicture.src || "/assets/images/no-profile.png";
    editCurrentTrackTitle.value = currentTrackTitle.textContent || "";
    editCurrentTrackMeta.value = currentTrackMeta.textContent || "";
    selectedCurrentTrack.title = currentTrackTitle.textContent || "";
selectedCurrentTrack.meta = currentTrackMeta.textContent || "";

    
    renderEditChosenItems(editFavorites, editFavoritesList, "favorites");
    
    renderEditNotes();
}



function renderEditChosenItems(items, container, targetList) {
    container.innerHTML = "";

    if (items.length === 0){
        container.innerHTML = "<p class='empty-edit-text'>no favorites yet</p>";
        return;
    }

    items.forEach(function(item, index) {
        const chip = document.createElement("div");
        chip.className = "chosen-chip";

        chip.innerHTML = `
            <div>
                <p class="chosen-title">${item.title || "untitled"}</p>
                <p class="chosen-meta">${item.type || ""}</p>
            </div>
            <button class="remove-item-btn" type="button">&#10005;</button>
        `;

        const removeBtn = chip.querySelector(".remove-item-btn");

        removeBtn.addEventListener("click", function() {
            items.splice(index, 1);
            renderEditChosenItems(editFavorites, editFavoritesList, "favorites");
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
            currentTrackTitle: selectedCurrentTrack.title || editCurrentTrackTitle.value,
            currentTrackMeta: selectedCurrentTrack.meta || editCurrentTrackMeta.value,
            currentTrackPreviewUrl: selectedCurrentTrack.previewUrl || "",
            currentTrackCover: selectedCurrentTrack.cover || "",
            favorites: editFavorites,
            notes: editNotes,
            pinnedPostId: pinnedPostId,
        });
        
        profileName.textContent = editName.value;
        profileUsername.textContent = "@" + editUsername.value;
        profileBio.textContent = editBio.value;
        profilePicture.src = profilePictureUrl;
        currentTrackTitle.textContent = selectedCurrentTrack.title || editCurrentTrackTitle.value;
        currentTrackMeta.textContent = selectedCurrentTrack.meta || editCurrentTrackMeta.value;
        renderCarousel(editFavorites, favoritesTrack);
     
        initCarousel("favorites-track");
  
        renderNotes(editNotes);

        closeEditModal();
    });
}

openEditModalBtn.addEventListener("click", openEditModal);
closeEditModalBtn.addEventListener("click", closeEditModal);
cancelEditModalBtn.addEventListener("click", closeEditModal);
modalOverlay.addEventListener("click", closeEditModal);


    const vinylToggle = document.getElementById("vinyl-toggle");
    const vinylRecord = document.querySelector(".vinyl-record");

async function toggleVinylPlay() {
    console.log("current track:", selectedCurrentTrack);

    const previewUrl = selectedCurrentTrack.previewUrl;

    if (!previewUrl){
        console.log("no preview url");
        return;
    }

    try {
        if (!currentAudio || currentAudio.src !== previewUrl){
            if (currentAudio){
                currentAudio.pause();
            }

            currentAudio = new Audio();
            currentAudio.src = previewUrl;
            currentAudio.crossOrigin = "anonymous";
            currentAudio.load();

            currentAudio.addEventListener("ended", function(){
                vinylRecord.classList.remove("spinning");
            });
        }

        if (currentAudio.paused){
            await currentAudio.play();
            vinylRecord.classList.add("spinning");
        } else {
            currentAudio.pause();
            vinylRecord.classList.remove("spinning");
        }

    } catch(error){
        console.error("audio play failed:", error);
    }
}

vinylToggle.addEventListener("click", toggleVinylPlay);

