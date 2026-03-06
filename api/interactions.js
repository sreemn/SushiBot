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
    name: "bloxhelp",
    description: "Request assistance from the helper team"
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
    const { name, options } = body.data;
    const guildId = body.guild_id;

    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0xe7a67c,
            description: "You can find a list of commands here: https://sushibot.co/commands\n" +
                         "Join the server if you still have questions: https://discord.gg/QkvahZ4yW3\n\n" +
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
            color: 0x8f95f5,
            author: {
              name: user.discriminator !== "0" ? `${user.username}#${user.discriminator}` : user.username,
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

    if (name === "bloxhelp") {
      const HELPER_ROLE_ID = "1479018520942481560";
      const HELPER_CHANNEL_ID = "1479020201348694056";
      const userId = body.member.user.id;

      await fetch(`https://discord.com/api/v10/channels/${HELPER_CHANNEL_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content: `**Blox Help Requested!**\n<@&${HELPER_ROLE_ID}>, <@${userId}> needs assistance!`,
          allowed_mentions: {
            roles: [HELPER_ROLE_ID],
            users: [userId]
          }
        })
      });

      return res.status(200).json({
        type: 4,
        data: {
          content: "Your request has been sent to the Helpers!",
          flags: 64
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
