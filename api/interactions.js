export const config = {
  api: {
    bodyParser: true
  }
};

const BOT_TOKEN = process.env.BOT_TOKEN;

const COMMAND_CHANNEL = "1476997107885019218";
const LOG_CHANNEL = "1478827650410741850";

async function sendCommandsPanel() {

  const moderation = [
    "<:sushiDot:1478821870999441489> `/warn`",
    "<:sushiDot:1478821870999441489> `/kick`",
    "<:sushiDot:1478821870999441489> `/ban`",
    "<:sushiDot:1478821870999441489> `/timeout`",
    "<:sushiDot:1478821870999441489> `/history`",
    "<:sushiDot:1478821870999441489> `/lookup`",
    "<:sushiDot:1478821870999441489> `/uncase`"
  ].join("\n");

  const utility = [
    "<:blueDot:1478822082061271131> `/userinfo`",
    "<:blueDot:1478822082061271131> `/serverinfo`",
    "<:blueDot:1478822082061271131> `/avatar`",
    "<:blueDot:1478822082061271131> `/ping`",
    "<:blueDot:1478822082061271131> `/help`"
  ].join("\n");

  const res = await fetch(
    `https://discord.com/api/v10/channels/${COMMAND_CHANNEL}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: "",
        flags: 32768,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: "## Sushi Bot Command Center"
              },
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
    }
  );

  return res.status;
}

async function sendLog(status) {

  const time = new Date().toISOString();

  await fetch(
    `https://discord.com/api/v10/channels/${LOG_CHANNEL}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        embeds: [
          {
            title: "Command Panel Deployment",
            description: "Sushi command panel was deployed successfully.",
            color: 5763719,
            fields: [
              {
                name: "Status",
                value: `HTTP ${status}`,
                inline: true
              },
              {
                name: "Channel",
                value: `<#1476997107885019218>`,
                inline: true
              }
            ],
            footer: {
              text: "Sushi Bot Logging System"
            },
            timestamp: time
          }
        ]
      })
    }
  );
}

export default async function handler(req, res) {
  try {

    const status = await sendCommandsPanel();

    await sendLog(status);

    return res.status(200).json({
      success: true,
      panel_status: status
    });

  } catch (err) {

    await fetch(
      `https://discord.com/api/v10/channels/${LOG_CHANNEL}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          embeds: [
            {
              title: "Deployment Error",
              description: err.message,
              color: 15548997,
              timestamp: new Date().toISOString()
            }
          ]
        })
      }
    );

    return res.status(500).json({ error: err.message });
  }
}
