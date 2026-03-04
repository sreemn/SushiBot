export const config = {
  api: {
    bodyParser: true
  }
};

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_ID = process.env.BOT_ID;

const COOLDOWN = 5000;
let lastReply = 0;

async function replySushi(channelId, messageId) {

  const sushiMessages = [
    "<:corgiroll:1478798767015858388> The corgi chef rolled in after that ping!",
    "<:winksushi:1478797530639761429> Hey there… was that a sushi summon? 😉",
    "<:sushiangryping:1478797613578059856> WHO PINGED THE SUSHI MASTER?!",
    "<:sushiangry:1478797656254841003> Stop poking the sushi bot unless you bring soy sauce.",
    "<:sushibox:1478797564164964424> Sushi delivery detected. What do you need?",
    "<:sushi:1478797690157666384> A wild sushi bot appeared."
  ];

  const msg = sushiMessages[Math.floor(Math.random() * sushiMessages.length)];

  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message_reference: { message_id: messageId },
        content: msg
      })
    }
  );

  const data = await res.json();

  await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${data.id}/reactions/1478798767015858388/@me`,
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
    const author = body?.author;

    if (!channelId || !messageId) {
      return res.status(200).json({ ignored: true });
    }

    if (author?.bot) {
      return res.status(200).json({ ignored: true });
    }

    const mentionedBot = mentions.some(u => u.id === BOT_ID);

    if (!mentionedBot) {
      return res.status(200).json({ ignored: true });
    }

    const now = Date.now();
    if (now - lastReply < COOLDOWN) {
      return res.status(200).json({ cooldown: true });
    }

    lastReply = now;

    await replySushi(channelId, messageId);

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
