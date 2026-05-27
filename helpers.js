export function formatDate(timestamp){
    if (!timestamp){
        return "unknown";
    }

    const date = timestamp.toDate();
    return date.toLocaleDateString();
}

export function formatTime(timestamp){
    if (!timestamp){
        return "";
    }

    const date = timestamp.toDate();

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

// choose the post detail
export function getMiniText(post) {
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

export function isToday(timestamp){
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