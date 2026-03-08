import nacl from "tweetnacl";

export const config = {
  api: {
    bodyParser: false
  }
};

const APP_ID = process.env.APP_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_KEY = process.env.PUBLIC_KEY;

const commands = [
  {
    name: "help",
    description: "Get information about sushi",
    type: 1
  },
  {
    name: "status",
    description: "View sushi bot status",
    type: 1
  },
  {
    name: "userinfo",
    description: "Show information about a user",
    type: 1,
    options: [
      {
        name: "user",
        description: "The user to lookup",
        type: 6,
        required: true
      }
    ]
  },
  {
    name: "Timeout",
    type: 2
  },
  {
    name: "Mute",
    type: 3
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

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  const rawBody = await new Promise((resolve) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
    });
    req.on("end", () => {
      resolve(data);
    });
  });

  const isVerified = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  );

  if (!isVerified) {
    return res.status(401).send("Invalid request signature");
  }

  const body = JSON.parse(rawBody);

  if (body.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  if (body.type === 2) {

    const name = body.data.name;
    const options = body.data.options;

    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0xe7a67c,
            description: "You can find a list of commands here: https://sushibot.co/commands\nJoin the server if you still have questions: https://discord.gg/QkvahZ4yW3\n\nThe privacy policy can be found here: https://sushibot.co/privacy"
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
            color: 0x8f95f5,
            description: `Heartbeat: \`${heartbeat}ms\`\nLatency: \`${latency}ms\``
          }]
        }
      });
    }

    if (name === "userinfo") {

      const userId = options[0].value;
      const user = body.data.resolved.users[userId];
      const member = body.data.resolved.members?.[userId];

      const createdAt = new Date(Number((BigInt(userId) >> 22n) + 1420070400000n));
      const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      const parts = createdAt.toUTCString().split(" ");
      const formattedDate = `${parts[2]} ${parts[1]} ${parts[3]}`;
      const formattedTime = `${parts[4]} GMT`;

      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;

      const accountType = user.bot ? "Bot" : user.system ? "System" : "User";

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0x8f95f5,
            author: {
              name: user.discriminator !== "0" ? `${user.username}#${user.discriminator}` : user.username,
              icon_url: avatarUrl
            },
            fields: [
              {
                name: "User ID:",
                value: `\`\`\`\n${userId}\n\`\`\``
              },
              {
                name: "Created at:",
                value: `\`\`\`\n- ${daysAgo} days ago\n- ${formattedDate}\n- ${formattedTime}\n\`\`\``
              },
              {
                name: "Account Type:",
                value: `\`\`\`\n${accountType}\n\`\`\``
              }
            ],
            footer: !member ? { text: "The user you are inspecting is not on this server." } : undefined
          }]
        }
      });
    }

    if (name === "Timeout") {

      const targetUserId = body.data.target_id;

      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          content: `Timeout requested for <@${targetUserId}>`
        }
      });
    }

    if (name === "Mute") {

      const message = body.data.resolved.messages[body.data.target_id];
      const targetUserId = message.author.id;

      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          content: `Mute requested for <@${targetUserId}>`
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
