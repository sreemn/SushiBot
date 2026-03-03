export const config = {
  api: {
    bodyParser: false
  }
};

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = "1478451760027799685";

async function postSushi() {
  const sushiImages = [
    "https://source.unsplash.com/800x600/?sushi",
    "https://source.unsplash.com/800x600/?nigiri",
    "https://source.unsplash.com/800x600/?maki",
    "https://source.unsplash.com/800x600/?salmon-sushi"
  ];

  const randomImage =
    sushiImages[Math.floor(Math.random() * sushiImages.length)];

  const messageRes = await fetch(
    `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        embeds: [
          {
            title: "🍣 Fresh Sushi Drop",
            image: { url: randomImage },
            color: 12765423
          }
        ]
      })
    }
  );

  if (!messageRes.ok) {
    const errorText = await messageRes.text();
    throw new Error(errorText);
  }

  const messageData = await messageRes.json();
  const messageId = messageData.id;

  await fetch(
    `https://discord.com/api/v10/channels/${CHANNEL_ID}/messages/${messageId}/reactions/%F0%9F%8D%A3/@me`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`
      }
    }
  );
}

export default async function handler(req, res) {
  try {
    await postSushi();
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
