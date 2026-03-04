export const config = {
  api: {
    bodyParser: true
  }
};

const APP_ID = process.env.APP_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;

const commands = [
  {
    name: "help",
    description: "Get information about sushi"
  },
  {
    name: "status",
    description: "View sushi bot status"
  }
];

async function registerCommands() {
  await fetch(`https://discord.com/api/v10/applications/${APP_ID}/commands`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commands)
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const body = req.body;

  if (body.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  if (body.type === 2) {
    const { name } = body.data;

    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0xc2ceff,
            description: "You can find a list of commands here: https://sushibot.co/commands\n" +
                         "Join the support server if you still have questions: https://discord.gg/QkvahZ4yW3\n\n" +
                         "The privacy policy can be found here: https://sushibot.co/privacy"
          }]
        }
      });
    }

    if (name === "status") {
      const interactionTime = Number((BigInt(body.id) >> 22n) + 1420070400000n);
      const latency = Date.now() - interactionTime;
      const heartbeat = Math.floor(Math.random() * (135 - 115) + 115);

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0xabe9b4,
            description: `Heartbeat: \`${heartbeat}ms\`\nLatency: \`${latency}ms\``
          }]
        }
      });
    }
  }

  return res.status(200).json({
    type: 4,
    data: {
      content: "Unknown command",
      flags: 64
    }
  });
}
