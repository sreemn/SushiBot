export const config = {
  api: {
    bodyParser: true
  }
};

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_ID = process.env.BOT_ID;

async function replySushi(channelId, messageId) {

  const sushiMessages = [
    "<:corgiroll:1478798767015858388> The corgi chef rolled in with sushi!",
    "<:winksushi:1478797530639761429> Hey... was that a sushi ping? 😉",
    "<:sushiangryping:1478797613578059856> WHO SUMMONED THE SUSHI MASTER?!",
    "<:sushiangry:1478797656254841003> Stop poking the sushi bot unless you bring soy sauce.",
    "<:sushibox:1478797564164964424> Sushi delivery detected. What do you need?",
    "<:sushi:1478797690157666384> A wild sushi bot appeared."
  ];

  const msg = sushiMessages[Math.floor(Math.random() * sushiMessages.length)];

  const messageRes = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message_reference: {
          message_id: messageId
        },
        content: msg
      })
    }
  );

  const messageData = await messageRes.json();

  await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageData.id}/reactions/1478798767015858388/@me`,
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

    const body = req.body;

    const channelId = body?.channel_id;
    const messageId = body?.id;
    const mentions = body?.mentions || [];

    const mentionedBot = mentions.some(user => user.id === BOT_ID);

    if (mentionedBot) {
      await replySushi(channelId, messageId);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
