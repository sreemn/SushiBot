const BOT_TOKEN = process.env.BOT_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

const CHANNEL_ID = "1478451760027799685";

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sushiImages = [
    "https://source.unsplash.com/800x600/?sushi",
    "https://source.unsplash.com/800x600/?nigiri",
    "https://source.unsplash.com/800x600/?maki",
    "https://source.unsplash.com/800x600/?salmon-sushi"
  ];

  const randomImage =
    sushiImages[Math.floor(Math.random() * sushiImages.length)];

  await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
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
          color: 0xc2ceff
        }
      ]
    })
  });

  return res.status(200).json({ success: true });
}
