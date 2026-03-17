let lastAvatarUpdate = 0;

async function maybeRotateAvatar() {
  const now = Date.now();

  if (now - lastAvatarUpdate < 12 * 60 * 60 * 1000) return;
  lastAvatarUpdate = now;

  try {
    const TOKEN = process.env.BOT_TOKEN;

    const avatars = [
      "https://sushidiscord.vercel.app/assets/logo1.png",
      "https://sushidiscord.vercel.app/assets/logo2.png",
      "https://sushidiscord.vercel.app/assets/logo3.png"
    ];

    const index = Math.floor(now / (12 * 60 * 60 * 1000)) % avatars.length;

    const imgRes = await fetch(avatars[index]);
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    await fetch("https://discord.com/api/v10/users/@me", {
      method: "PATCH",
      headers: {
        Authorization: `Bot ${TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        avatar: `data:image/png;base64,${base64}`
      })
    });
  } catch (e) {
    console.error(e);
  }
}

export default async function handler(req, res) {
  await maybeRotateAvatar();
  res.status(200).end();
}
