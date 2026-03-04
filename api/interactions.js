export const config = {
  api: {
    bodyParser: true
  }
};

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_ID = process.env.APP_ID;
const LOG_CHANNEL = "1478827650410741850";

const MOD_ROLES = [
  "1476989406337564795",
  "1476988637190033571",
  "1478804423554764952",
  "1476988708979740844"
];

let CASE_ID = 0;

const commands = [
  {
    name: "ban",
    description: "Ban a member",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "reason", type: 3, description: "Reason", required: true }
    ]
  },
  {
    name: "kick",
    description: "Kick a member",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "reason", type: 3, description: "Reason", required: true }
    ]
  },
  {
    name: "timeout",
    description: "Timeout a member",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "reason", type: 3, description: "Reason", required: true },
      { name: "duration", type: 4, description: "Duration in minutes", required: false }
    ]
  },
  {
    name: "warn",
    description: "Warn a member",
    options: [
      { name: "user", type: 6, description: "User", required: true },
      { name: "reason", type: 3, description: "Reason", required: true }
    ]
  },
  { name: "history", description: "View moderation history" },
  { name: "lookup", description: "Lookup a case" },
  { name: "uncase", description: "Remove a case" },
  { name: "userinfo", description: "View user information" },
  { name: "avatar", description: "View user avatar" },
  { name: "ping", description: "Check bot latency" },
  { name: "help", description: "Show help panel" }
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

function isModerator(memberRoles) {
  return memberRoles.some(r => MOD_ROLES.includes(r));
}

async function logCase(action, userId, moderatorId, reason) {
  CASE_ID++;
  await fetch(`https://discord.com/api/v10/channels/${LOG_CHANNEL}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      embeds: [{
        title: `Case #${CASE_ID}`,
        color: 12714495,
        fields: [
          { name: "Action", value: action, inline: true },
          { name: "User", value: `<@${userId}>`, inline: true },
          { name: "Moderator", value: `<@${moderatorId}>`, inline: true },
          { name: "Reason", value: reason || "No reason provided" }
        ],
        timestamp: new Date().toISOString(),
        footer: {
          text: "Sapphire • Moderation Log"
        }
      }]
    })
  });
}

async function banUser(guildId, userId, reason) {
  await fetch(`https://discord.com/api/v10/guilds/${guildId}/bans/${userId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ reason })
  });
}

async function kickUser(guildId, userId) {
  await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`
    }
  });
}

export default async function handler(req, res) {
  const body = req.body;

  if (body.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  if (!body.data || !body.data.name) {
    return res.status(400).json({ error: "Invalid interaction" });
  }

  const command = body.data.name;
  const guildId = body.guild_id;
  const member = body.member;
  const moderatorId = member.user.id;

  if (["ban", "kick", "timeout", "warn"].includes(command)) {
    if (!isModerator(member.roles)) {
      return res.json({
        type: 4,
        data: { content: "Insufficient permissions." }
      });
    }

    const userId = body.data.options.find(o => o.name === "user")?.value;
    const reasonObj = body.data.options.find(o => o.name === "reason");
    const reason = reasonObj ? reasonObj.value : "No reason provided";

    if (!userId) {
      return res.json({
        type: 4,
        data: { content: "Target user required." }
      });
    }

    if (command === "ban") await banUser(guildId, userId, reason);
    if (command === "kick") await kickUser(guildId, userId);

    await logCase(command.toUpperCase(), userId, moderatorId, reason);

    const actionWord = command === "timeout" ? "Timed out" :
                       command === "warn"    ? "Warned"    :
                       command.charAt(0).toUpperCase() + command.slice(1) + "ed";

    return res.json({
      type: 4,
      data: {
        content: `**${actionWord}** <@${userId}>\n**Reason** — ${reason}`
      }
    });
  }

  if (command === "ping") {
    return res.json({
      type: 4,
      data: { content: "Pong." }
    });
  }

  if (command === "userinfo") {
    const targetId = body.data.options?.[0]?.value ?? member.user.id;

    return res.json({
      type: 4,
      data: {
        content: `**User Information**\n• ID: ${targetId}\n• Mention: <@${targetId}>`
      }
    });
  }

  if (command === "avatar") {
    const targetId = body.data.options?.[0]?.value ?? member.user.id;
    const avatarHash = body.data.options?.[0]?.value 
      ? null 
      : member.user.avatar;

    const avatarUrl = avatarHash
      ? `https://cdn.discordapp.com/avatars/${targetId}/${avatarHash}.png?size=1024`
      : `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 6)}.png`;

    return res.json({
      type: 4,
      data: { content: avatarUrl }
    });
  }

  if (command === "help") {
    return res.json({
      type: 4,
      data: {
        embeds: [{
          title: "Sushi Bot Command's",
          description: "Get information about sushi commands.",
          color: 12714495,
          fields: [
            {
              name: "Moderation Commands:",
              value:
                "<:blueDot:1478822082061271131> `/warn`\n" +
                "<:blueDot:1478822082061271131> `/kick`\n" +
                "<:blueDot:1478822082061271131> `/ban`\n" +
                "<:blueDot:1478822082061271131> `/timeout`\n" +
                "<:blueDot:1478822082061271131> `/history`\n" +
                "<:blueDot:1478822082061271131> `/lookup`\n" +
                "<:blueDot:1478822082061271131> `/uncase`",
              inline: false
            },
            {
              name: "Utility Commands:",
              value:
                "<:sushiDot:1478821870999441489> `/userinfo`\n" +
                "<:sushiDot:1478821870999441489> `/avatar`\n" +
                "<:sushiDot:1478821870999441489> `/ping`\n" +
                "<:sushiDot:1478821870999441489> `/help`",
              inline: false
            }
          ]
        }]
      }
    });
  }

  return res.json({
    type: 4,
    data: { content: "Command not recognized." }
  });
}
