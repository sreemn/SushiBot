import fetch from "node-fetch";

const TOKEN = process.env.BOT_TOKEN;

const avatars = [
  "https://drive.google.com/uc?export=download&id=15faIMzZKCm12UEUGagEawPuffTaXnsMr",
  "https://drive.google.com/uc?export=download&id=1D_-79WFUo_gk7UvP7jlQsFAAup4amxo-",
  "https://drive.google.com/uc?export=download&id=17w44n8fXptohTV59llK6zUJswSa7NG_K"
];

let currentIndex = -1;
let lastHash = null;

async function getBase64(url) {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function rotateAvatar() {
  try {
    currentIndex = (currentIndex + 1) % avatars.length;

    const base64 = await getBase64(avatars[currentIndex]);

    if (base64 === lastHash) return;

    lastHash = base64;

    const res = await fetch("https://discord.com/api/v10/users/@me", {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        avatar: `data:image/png;base64,${base64}`
      })
    });

    if (res.status === 429) {
      const data = await res.json();
      const wait = (data.retry_after || 10) * 1000;
      console.log("Rate limited. Waiting:", wait);
      setTimeout(rotateAvatar, wait);
      return;
    }

    console.log("Avatar updated:", new Date().toLocaleTimeString());

  } catch (err) {
    console.error("Rotation error:", err);
  }
}

function start() {
  rotateAvatar();
  setInterval(rotateAvatar, 10 * 60 * 1000);
}

start();
