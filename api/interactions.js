export const config = {
  api: {
    bodyParser: true
  }
};

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = "1476997107885019218";

export default async function handler(req, res) {
  try {

    const moderation = [
      "<:sushiDot:1478821870999441489> `/warn`",
      "<:sushiDot:1478821870999441489> `/kick`",
      "<:sushiDot:1478821870999441489> `/ban`",
      "<:sushiDot:1478821870999441489> `/history`",
      "<:sushiDot:1478821870999441489> `/lookup`",
      "<:sushiDot:1478821870999441489> `/uncase`",
      "<:sushiDot:1478821870999441489> `/timeout`"
    ].join("\n");

    const utility = [
      "<:blueDot:1478822082061271131> `/userinfo`"
    ].join("\n");

    await fetch(`https://discord.com/api/v10/channels/${CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        flags: 1 << 15,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: "**Moderation Commands**"
              },
              {
                type: 10,
                content: moderation
              },
              {
                type: 10,
                content: "**Utility Commands**"
              },
              {
                type: 10,
                content: utility
              }
            ]
          }
        ]
      })
    });

    return res.status(200).json({ sent: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
