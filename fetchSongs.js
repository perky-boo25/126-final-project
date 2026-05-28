const fs = require("fs");

async function generateSongsJson() {
  try {
    console.log("Fetching 40 tracks from Deezer...");

    // Changed limit parameter from 15 to 40
    const response = await fetch(
      "https://api.deezer.com/chart/0/tracks?limit=40",
    );
    const deezerData = await response.json();

    const formattedSongs = deezerData.data.map((track) => {
      const minutes = Math.floor(track.duration / 60);
      const seconds = (track.duration % 60).toString().padStart(2, "0");

      return {
        title: track.title,
        subtitle: track.artist.name,
        img: track.album.cover_xl,
        genre: "pop",
        liked: false,
        description: `A trending track by ${track.artist.name}, featured on the album "${track.album.title}".`,
        meta: [
          { label: "Released", value: new Date().getFullYear().toString() },
          { label: "Album", value: track.album.title },
          { label: "Duration", value: `${minutes}:${seconds}` },
        ],
        link: {
          label: "Open in Deezer",
          url: track.link,
        },
      };
    });

    fs.writeFileSync("songs.json", JSON.stringify(formattedSongs, null, 2));
    console.log(
      "Success! songs.json now contains 40 tracks and is ready for use.",
    );
  } catch (error) {
    console.error("Error fetching or writing data:", error);
  }
}

generateSongsJson();
