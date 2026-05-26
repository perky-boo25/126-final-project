//import the firestore database from firebase.js
import {db} from "./firebase.js";

//import the firestore functions needed to read posts
import {
    collection,
    query,
    orderBy,
    getDocs,
    limit
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const feed = document.getElementById("feed");
const filterButtons = document.querySelectorAll(".filter");
const activeUsersList = document.getElementById("active-users-list");
const recentActivityList = document.getElementById("recent-activity-list");
const updatesTodayCount = document.getElementById("updates-today-count");
let allPosts = [];

//loads posts as soon as the page opens
loadDashboardPosts();
loadActiveUsers();
loadRecentActivity();


//function to get all posts from db
async function loadDashboardPosts(){
    const postsRef = collection(db, "posts");

    //newest posts first
    const q = query(
        postsRef,
        orderBy("datePosted", "desc")
    )


    const snapshot = await getDocs(q);

    feed.innerHTML ="";

    //create one post card for each document
    snapshot.forEach(function(docSnap) {
        const post = docSnap.data();

        allPosts.push(post);
    });

    renderPosts(allPosts);
}

// shows the posts on the dashboard
function renderPosts(posts) {
    feed.innerHTML = "";

    posts.forEach(function(post) {
        const postElement = createPostElement(post);
        feed.appendChild(postElement);
    });
}

async function loadActiveUsers(){
    const usersRef = collection(db, "users");

    const q = query(
        usersRef,
        orderBy("lastActiveAt", "desc"),

    )

    const snapshot = await getDocs(q);

    activeUsersList.innerHTML = "";

    snapshot.forEach(function(docSnap){
        const user = docSnap.data();
        const userCard = document.createElement("div");
        userCard.className = "user-card";

        userCard.innerHTML = `
            <img class="active-profile" src="${user.userProfilePicture || "no-profile.png"}" alt="profile">
            <span class="active-username">@${user.username || "username"}</span>
            `;

        activeUsersList.appendChild(userCard);


    });
}

//get newest activity from posts
async function loadRecentActivity(){
    const postRef = collection(db, "posts");

    const q = query (
        postsRef,
        orderBy("datePosted", "desc"),
    );

    const snapshot = await getDocs(q);

    recentActivityList.innerHTML = "";

    let countToday = 0;

    snapshot.forEach(function(docSnap){
        const post = docSnap.data();
        const row = document.createElement("div");
        row.className = "receipt-row";

        row.innerHTML = `
            <span>@${post.username || "username"}</span>
            <span>${getMiniText(post)}</span>
            `;

        recentActivityList.append(row);

        if (isToday(post.datePosted)){
            countToday++;
        }
    });

    updatesTodayCount.textContent = String(countToday).padStart(2, "0");
}

function isToday(timestamp){
    if(!timestamp){
        return false;
    }

    const date = timestamp.toDate();
    const today = new Date();

    return(
        date.getFullYear() == today.getFullYear()&&
        date.getMonth() == today.getMonth()&&
        date.getDate() == today.getDate()
    );
}


// makes the filter buttons work
filterButtons.forEach(function(button) {
    button.addEventListener("click", function() {
        const selectedFilter = button.dataset.filter;

        filterButtons.forEach(function(btn) {
            btn.classList.remove("active");
        });

        button.classList.add("active");

        if (selectedFilter === "all") {
            renderPosts(allPosts);
            return;
        }

        const filteredPosts = allPosts.filter(function(post) {
            if (selectedFilter === "entry") {
                return post.type === "entry";
            }

            if (selectedFilter === "music") {
                return post.category === "music" || post.category === "song" || post.category === "album";
            }

            if (selectedFilter === "film") {
                return post.category === "film" || post.category === "movie";
            }

            return post.category === selectedFilter;
        });

        renderPosts(filteredPosts);
    });
});

//create the html design for one post
function createPostElement(post){
    const article = document.createElement("article");

    //adds classes
    article.className = `post ${post.category}--post`;

    article.innerHTML = `
        <div class="float-img ${post.category}-img">
            <img src="${getAsset(post.category, post.type)}" alt="post asset">
        </div>

        <div class="post-main">
            <div class="post-head">
                <div class="profile-row">
                    <img class="post-profile" src="${post.userProfilePicture || "no-profile.png"}" alt="profile">
                    <div>
                        <p class="username">@${post.username || "username"}</p>
                        <p class="mini-text">${getMiniText(post)}</p>
                    </div>
                </div>

                <div class="post-meta">
                    <p>${post.activityDate || ""}</p>
                    <p>${formatTime(post.datePosted)}</p>
                </div>
            </div>

            <div class="post-body">
                <h2 class="post-title">${post.title || ""}</h2>

                <p class="post-content">
                    ${post.body || ""}
                </p>

                ${post.imageUrl ? `
                    <div class="media-box">
                        <div class="content-img">
                            <img src="${post.imageUrl}" alt="content image">
                        </div>
                    </div>
                ` : ""}
            </div>
        </div>

        <aside class="stub">
            <div class="stub-cut"></div>

            <div class="stub-icon">${getStubIcon(post.category, post.type)}</div>

            <p class="stub-type">${post.category || post.type || "post"}</p>

            <p class="stub-code">${post.tagType || ""}</p>

            <div class="stamp-box">
                <img class="stamp-img" src="heart.png" alt="ink stamp placeholder">
            </div>

            <p class="stub-rate">${formatRating(post.rating, post.type)}</p>
        </aside>
    `;

    addStampInteraction(article);

    return article;
}


// choose the asset based on category
function getAsset(category, type) {
    if (category === "book") {
        return "book.png";
    }

    if (category === "movie" || category === "film") {
        return "movie.png";
    }

    if (category === "song" || category === "album" || category === "music") {
        return "vinyl.png";
    }

    if (type === "entry") {
        return "entry.png";
    }

    return "entry.png";
}


// choose the post detail
function getMiniText(post) {
    if (post.type === "entry") {
        return "posted a journal entry";
    }

    if (post.category === "book") {
        return "logged a book";
    }

    if (post.category === "movie" || post.category === "film") {
        return "logged a film";
    }

    if (post.category === "song" || post.category === "album" || post.category === "music") {
        return "shared a listening log";
    }

    return "posted an update";
}


// chooses the letter inside the ticket stub
function getStubIcon(category, type) {
    if (type === "entry") {
        return "E";
    }

    if (category === "book") {
        return "B";
    }

    if (category === "movie" || category === "film") {
        return "F";
    }

    if (category === "song" || category === "album" || category === "music") {
        return "M";
    }

    return "P";
}


// formats the rating shown in the stub
function formatRating(rating, type) {
    if (type === "entry") {
        return "note";
    }

    if (!rating || rating === 0) {
        return "unrated";
    }

    return `${rating}/5`;
}


// converts firestore timestamp into readable time
function formatTime(timestamp) {
    if (!timestamp) {
        return "";
    }

    const date = timestamp.toDate();

    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}


// adds stamp effect
function addStampInteraction(postElement) {
    const stamp = postElement.querySelector(".stamp-img");

    postElement.addEventListener("dblclick", function(event) {
        event.preventDefault();

        const selection = window.getSelection();

        if (selection && selection.removeAllRanges) {
            selection.removeAllRanges();
        }

        if (postElement.classList.contains("liked")) {
            postElement.classList.remove("liked");
            stamp.style.transform = "";
        } else {
            const randomRotate = (Math.random() * 10 - 5).toFixed(2);

            postElement.classList.add("liked");
            stamp.style.transform = `rotate(${randomRotate}deg)`;
        }
    });
}

