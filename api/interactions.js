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
    description: "Get information about bot"
  },
  {
    name: "status",
    description: "View sushi bot status"
  },
  {
    name: "userinfo",
    description: "Show information about a user",
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
    name: "hug",
    description: "Hug a friend",
    options: [
      {
        name: "user",
        description: "User to hug",
        type: 6,
        required: true
      }
    ]
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

  let rawBody = "";

  await new Promise((resolve) => {
    req.on("data", chunk => {
      rawBody += chunk;
    });
    req.on("end", resolve);
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
    const options = body.data.options || [];

    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              color: 0x6266ec,
              description:
                "You can find a list of commands here: https://sreeman.io/commands\n" +
                "Join the server if you still have questions: https://discord.gg/QkvahZ4yW3\n\n" +
                "The privacy policy can be found here: https://sreeman.io/privacy"
            }
          ]
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
          embeds: [
            {
              color: 0x6ed683,
              description: `Heartbeat: \`${heartbeat}ms\`\nLatency: \`${latency}ms\``
            }
          ]
        }
      });
    }

    if (name === "userinfo") {

      const userId = options[0].value;
      const user = body.data.resolved.users[userId];
      const member = body.data.resolved.members?.[userId];

      const createdAt = new Date(Number((BigInt(userId) >> 22n) + 1420070400000n));
      const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / 86400000);

      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;

      const accountType = user.bot ? "Bot" : user.system ? "System" : "User";

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              color: 0x313338,
              author: {
                name:
                  user.discriminator !== "0"
                    ? `${user.username}#${user.discriminator}`
                    : user.username,
                icon_url: avatarUrl
              },
              fields: [
                {
                  name: "User ID",
                  value: `\`\`\`\n${userId}\n\`\`\``
                },
                {
                  name: "Account Created",
                  value: `\`\`\`\n${daysAgo} days ago\n${createdAt.toUTCString()}\n\`\`\``
                },
                {
                  name: "Account Type",
                  value: `\`\`\`\n${accountType}\n\`\`\``
                }
              ],
              footer: !member
                ? { text: "The user you are inspecting is not on this server." }
                : undefined
            }
          ]
        }
      });
    }

    if (name === "hug") {

      try {

        const response = await fetch("https://api.waifu.pics/sfw/hug");
        const json = await response.json();

        const userId = options[0].value;
        const target = body.data.resolved.users[userId];
        const author = body.member?.user || body.user;

        return res.status(200).json({
          type: 4,
          data: {
            embeds: [
              {
                color: 0xff7fb0,
                description: `**${author.username} hugged ${target.username}**`,
                image: {
                  url: json.url
                }
              }
            ]
          }
        });

      } catch {

        return res.status(200).json({
          type: 4,
          data: {
            content: "Failed to fetch hug gif.",
            flags: 64
          }
        });
      }
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
