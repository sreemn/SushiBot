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
    description: "Send a warm hug to another user",
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

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  let rawBody = "";

  await new Promise((resolve) => {
    req.on("data", chunk => rawBody += chunk);
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

  /* ---------------- COMMANDS ---------------- */

  if (body.type === 2) {

    const name = body.data.name;
    const options = body.data.options || [];

    /* HELP */

    if (name === "help") {

      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0x6266ec,
            description:
              "You can find a list of commands here: https://sreeman.io/commands\n" +
              "Join the server if you still have questions: https://discord.gg/QkvahZ4yW3\n\n" +
              "The privacy policy can be found here: https://sreeman.io/privacy"
          }]
        }
      });

    }

    /* STATUS */

    if (name === "status") {

      const interactionTime = Number((BigInt(body.id) >> 22n) + 1420070400000n);
      const latency = Date.now() - interactionTime;
      const heartbeat = Math.floor(Math.random() * (135 - 115) + 115);

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0x6ed683,
            description: `Heartbeat: \`${heartbeat}ms\`\nLatency: \`${latency}ms\``
          }]
        }
      });

    }

    /* USERINFO */

    if (name === "userinfo") {

      const userId = options[0].value;
      const user = body.data.resolved.users[userId];
      const member = body.data.resolved.members?.[userId];

      const createdAt = new Date(Number((BigInt(userId) >> 22n) + 1420070400000n));
      const daysAgo = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      const parts = createdAt.toUTCString().split(' ');
      const formattedDate = `${parts[2]} ${parts[1]} ${parts[3]}`;
      const formattedTime = `${parts[4]} GMT`;

      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${userId}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;

      const accountType = user.bot ? 'Bot' : user.system ? 'System' : 'User';

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0x313338,
            author: {
              name: user.discriminator !== "0"
                ? `${user.username}#${user.discriminator}`
                : user.username,
              icon_url: avatarUrl
            },
            fields: [
              {
                name: 'User ID:',
                value: `\`\`\`\n${userId}\n\`\`\``
              },
              {
                name: 'Created at:',
                value: `\`\`\`\n- ${daysAgo} days ago\n- ${formattedDate}\n- ${formattedTime}\n\`\`\``
              },
              {
                name: 'Account Type:',
                value: `\`\`\`\n${accountType}\n\`\`\``
              }
            ],
            footer: !member ? { text: 'The user you are inspecting is not on this server.' } : undefined
          }]
        }
      });

    }

    /* HUG COMMAND */

    if (name === "hug") {

      const targetId = options[0].value;
      const authorId = body.member?.user?.id || body.user.id;

      const gif = await fetch("https://api.waifu.pics/sfw/hug");
      const data = await gif.json();

      return res.status(200).json({
        type: 4,
        data: {
          content: `<@${authorId}> hugged <@${targetId}>`,
          embeds: [
            {
              color: 0xff7fb0,
              image: {
                url: data.url
              }
            }
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  label: "Hug Back",
                  custom_id: `hugback_${authorId}`,
                  emoji: {
                    name: "Heart",
                    id: "1396919562645143583"
                  }
                }
              ]
            }
          ],
          allowed_mentions: {
            users: [authorId, targetId]
          }
        }
      });

    }

  }

  /* BUTTON INTERACTION */

  if (body.type === 3) {

    if (body.data.custom_id.startsWith("hugback_")) {

      const targetId = body.data.custom_id.split("_")[1];
      const authorId = body.member?.user?.id || body.user.id;

      const gif = await fetch("https://api.waifu.pics/sfw/hug");
      const data = await gif.json();

      return res.status(200).json({
        type: 4,
        data: {
          content: `<@${authorId}> hugged <@${targetId}> back!`,
          embeds: [
            {
              color: 0xff7fb0,
              image: {
                url: data.url
              }
            }
          ],
          allowed_mentions: {
            users: [authorId, targetId]
          }
        }
      });

    }

  }

  return res.status(200).json({
    type: 4,
    data: {
      content: "Unknown command"
    }
  });

}
