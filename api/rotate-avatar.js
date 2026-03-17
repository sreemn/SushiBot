let lastAvatarUpdate = 0;

async function maybeRotateAvatar() {
  const now = Date.now();

  if (now - lastAvatarUpdate < 60 * 1000) {
    console.log("Skipped: cooldown");
    return;
  }

  lastAvatarUpdate = now;

  try {
    const TOKEN = process.env.BOT_TOKEN;

    const avatars = [
      "https://drive.google.com/uc?export=download&id=15faIMzZKCm12UEUGagEawPuffTaXnsMr",
      "https://drive.google.com/uc?export=download&id=1D_-79WFUo_gk7UvP7jlQsFAAup4amxo-",
      "https://drive.google.com/uc?export=download&id=17w44n8fXptohTV59llK6zUJswSa7NG_K"
    ];

    const index = Math.floor(Date.now() / (60 * 1000)) % avatars.length;
    console.log("Using avatar index:", index);

    const imgRes = await fetch(avatars[index]);
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

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

    const data = await res.json();
    console.log("Discord response:", data);

  } catch (e) {
    console.error("Error:", e);
  }
}

export default async function handler(req, res) {
  await maybeRotateAvatar();
  res.status(200).end();
}
