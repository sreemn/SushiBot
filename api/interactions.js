import nacl from "tweetnacl";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";

export const config = { api: { bodyParser: false } };

const APP_ID = process.env.APP_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const MONGODB_URI = process.env.sushi_MONGODB_URI;

const BAKE_COOLDOWN = 15000;
const TRANSFER_DAILY_LIMIT = 50000;
const FARM_COOLDOWN = 30000;

let cachedClient = null;

async function getDB() {
  if (cachedClient) return cachedClient.db("discordbot");
  const client = new MongoClient(MONGODB_URI, { maxPoolSize: 10 });
  await client.connect();
  cachedClient = client;
  return client.db("discordbot");
}

async function getUser(userId, username, guildId) {
  const db = await getDB();
  const users = db.collection("users");
  let user = await users.findOne({ userId, guildId });

  if (!user) {
    user = {
      userId,
      guildId,
      username,
      balance: 100,
      lastDaily: null,
      lastBake: null,
      transferDay: null,
      transferTotal: 0,
      lastTransferTime: null,
      blessHistory: {},
      createdAt: new Date()
    };
    await users.insertOne(user);
  } else if (user.username !== username) {
    await users.updateOne(
      { userId, guildId },
      { $set: { username } }
    );
  }

  return user;
}

async function safeBalanceUpdate(userId, guildId, amount) {
  const db = await getDB();
  const users = db.collection("users");
  const user = await users.findOne({ userId, guildId });
  if (!user) return;

  const newBalance = user.balance + amount;
  if (newBalance < 0) return;
  if (newBalance > 1000000000000000000) return;

  await users.updateOne(
    { userId, guildId },
    { $set: { balance: newBalance } }
  );
}

async function setField(userId, guildId, field, value) {
  const db = await getDB();
  await db.collection("users").updateOne(
    { userId, guildId },
    { $set: { [field]: value } },
    { upsert: true }
  );
}

function cooldownLeft(lastUsed, cooldownMs) {
  if (!lastUsed) return 0;
  const diff = cooldownMs - (Date.now() - new Date(lastUsed).getTime());
  return diff > 0 ? diff : 0;
}

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getNextResetTimestamp() {
  const now = new Date();

  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);

  const istNow = new Date(utc + (5.5 * 60 * 60 * 1000));

  const reset = new Date(istNow);
  reset.setHours(5, 30, 0, 0);

  if (istNow >= reset) {
    reset.setDate(reset.getDate() + 1);
  }

  const resetUTC = new Date(reset.getTime() - (5.5 * 60 * 60 * 1000));

  return Math.floor(resetUTC.getTime() / 1000);
}

function isSameResetCycle(lastTime) {
  if (!lastTime) return false;

  const now = new Date();
  const last = new Date(lastTime);

  const getResetDay = (date) => {
    const d = new Date(date);
    d.setHours(5, 30, 0, 0);
    if (date < d) d.setDate(d.getDate() - 1);
    return d.toDateString();
  };

  return getResetDay(now) === getResetDay(last);
}

const INGREDIENT_TABLE = [
  { name: "Small Sapling", cookies: 3, chance: 30 },
  { name: "Green Leaves", cookies: 8, chance: 25 },
  { name: "Wild Herbs", cookies: 20, chance: 20 },
  { name: "Ancient Bark", cookies: 50, chance: 13 },
  { name: "Mystic Clover", cookies: 120, chance: 8 },
  { name: "Forest Essence", cookies: 300, chance: 4 }
];

function rollBake() {
  const roll = rand(1, 100);
  let cumulative = 0;
  for (const item of INGREDIENT_TABLE) {
    cumulative += item.chance;
    if (roll <= cumulative) return item;
  }
  return INGREDIENT_TABLE[0];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  let rawBody = "";

  await new Promise(resolve => {
    req.on("data", chunk => rawBody += chunk);
    req.on("end", resolve);
  });

  const verified = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  );

  if (!verified) return res.status(401).send("Invalid request signature");

  const body = JSON.parse(rawBody);

  if (body.type === 1) return res.status(200).json({ type: 1 });
  if (body.type !== 2) return res.status(200).end();

  const name = body.data.name;
  const discordUser = body.member?.user || body.user;

  const userId = discordUser.id;
  const username = discordUser.username;
  const guildId = body.guild_id;

  if (name === "about") {
    const db = await getDB();
    const usersCollection = db.collection("users");

    const guilds = await usersCollection.distinct("guildId");
    const users = await usersCollection.distinct("userId");

    const guildCount = guilds.length;
    const userCount = users.length;

    return res.status(200).json({
      type: 4,
      data: {
        embeds: [
          {
            color: 0xC0EEFF,
            title: "About Miyra",
            description: "I'm a multipurpose Discord bot designed to make your server more fun and engaging!",
            fields: [
              { name: "Developer", value: "[sreeman](https://discord.com/users/783891446905438260)", inline: true },
              { name: "Website", value: "[miyra.bot](https://miyra.bot/)", inline: true }
            ],
            footer: { text: `Serving ${guildCount} guilds and ${userCount} users` }
          }
        ]
      }
    });
  }
if (name === "ping") {
  const start = Date.now();

  await fetch("https://discord.com/api/v10/gateway");

  const latency = Date.now() - start;

  const total = Math.floor(process.uptime());

  const years = Math.floor(total / 31536000);
  const months = Math.floor((total % 31536000) / 2592000);
  const weeks = Math.floor((total % 2592000) / 604800);
  const days = Math.floor((total % 604800) / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const parts = [
    years && `${years} yr${years > 1 ? "s" : ""}`,
    months && `${months} mo${months > 1 ? "s" : ""}`,
    weeks && `${weeks} wk${weeks > 1 ? "s" : ""}`,
    days && `${days} day${days > 1 ? "s" : ""}`,
    hours && `${hours} hr${hours > 1 ? "s" : ""}`,
    minutes && `${minutes} min${minutes > 1 ? "s" : ""}`,
    `${seconds} sec${seconds !== 1 ? "s" : ""}`
  ].filter(Boolean);

  const uptime = parts.join(", ");
  const region = process.env.VERCEL_REGION || "unknown";
  const version = "v3.19.0";

  return res.status(200).json({
    type: 4,
    data: {
      embeds: [
        {
          color: 0xC0EEFF,
          description:
`**Pong!**
data applies to this runtime instance

> • latency   \`${latency} ms\`
> • uptime    \`${uptime}\`
> • region    \`${region}\`
> • version   \`${version}\``
        }
      ]
    }
  });
}

if (name === "help") {
  return res.status(200).json({
    type: 4,
    data: {
      embeds: [
        {
          color: 0xC0EEFF,
          description:
`type \`/\` and click my icon to see a list of my commands.

[guides](https://miyra.bot/) | [support](https://discord.gg/CsEwcm9RBC) | [invite miyra](https://discord.com/oauth2/authorize?client_id=1482044394109407373)`,
          image: {
            url: "https://cdn.discordapp.com/attachments/1483714582651469935/1483720492773806110/ChatGPT_Image_Mar_18_2026_at_12_25_07_PM.png?ex=69bb9de3&is=69ba4c63&hm=8c8a73778794e7e7c65754df8fa20a7eba5b61ef717d8fa7009b26a474d27efd"
          }
        }
      ]
    }
  });
}

if (name === "bless") {
  const target = body.data.options.find(o => o.name === "user").value;

  const targetUser = body.data.resolved.users[target];

  if (target === userId) {
    return res.status(200).json({
      type: 4,
      data: { content: "you can't direct that energy inward, choose someone else" }
    });
  }

  if (targetUser?.bot) {
    return res.status(200).json({
      type: 4,
      data: { content: "that energy won’t land, choose a different user" }
    });
  }

  const user = await getUser(userId, username, guildId);
  let history = user.blessHistory || {};

  const lastBless = history[target];

  if (lastBless) {
    const nextReset = getNextResetTimestamp() * 1000;
    const prevReset = nextReset - 24 * 60 * 60 * 1000;
    const last = new Date(lastBless).getTime();

    if (last >= prevReset && last < nextReset) {
      return res.status(200).json({
        type: 4,
        data: {
          content: `hmm, you've already blessed this user in the past 24 hours. it resets every day at <t:${Math.floor(nextReset / 1000)}:t>.`
        }
      });
    }
  }

  const reward = Math.random() < 0.5 ? 1 : 5;

  history[target] = new Date();
  await setField(userId, guildId, "blessHistory", history);

  await safeBalanceUpdate(userId, guildId, reward);

  const avatar = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${userId}/${discordUser.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/0.png`;

  return res.status(200).json({
    type: 4,
    data: {
      embeds: [
        {
          color: 0xC0EEFF,
          author: {
            name: username,
            icon_url: avatar
          },
          description: `you have blessed <@${target}> . . .
${username} obtained ${reward} <:star:1483739099558055986>`
        }
      ]
    }
  });
}

  if (name === "give") {
    const target = body.data.options.find(o => o.name === "user").value;
    const amount = body.data.options.find(o => o.name === "amount").value;

    const targetUser = await fetch(
      `https://discord.com/api/v10/users/${target}`,
      { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
    ).then(r => r.json());

    if (targetUser.bot) {
      return res.status(200).json({
        type: 4,
        data: { content: "You cannot give trees to bots." }
      });
    }

    if (target === userId) {
      return res.status(200).json({
        type: 4,
        data: { content: "You cannot give trees to yourself." }
      });
    }

    if (amount <= 0) {
      return res.status(200).json({
        type: 4,
        data: { content: "Amount must be greater than 0." }
      });
    }

    const db = await getDB();
    const users = db.collection("users");

    const sender = await getUser(userId, username, guildId);
    await getUser(target, "User", guildId);

    const now = Date.now();
    const lastTransfer = sender.lastTransferTime
      ? new Date(sender.lastTransferTime).getTime()
      : 0;

    if (now - lastTransfer < FARM_COOLDOWN) {
      const remaining = Math.ceil((FARM_COOLDOWN - (now - lastTransfer)) / 1000);

      return res.status(200).json({
        type: 4,
        data: { content: `Slow down! Try again in ${remaining}s.` }
      });
    }

    const today = new Date().toDateString();

    if (sender.transferDay !== today) {
      await users.updateOne(
        { userId, guildId },
        { $set: { transferDay: today, transferTotal: 0 } }
      );

      sender.transferTotal = 0;
    }

    if ((sender.transferTotal || 0) + amount > TRANSFER_DAILY_LIMIT) {
      return res.status(200).json({
        type: 4,
        data: {
          content: `Daily transfer limit reached. You can only send ${TRANSFER_DAILY_LIMIT.toLocaleString()} trees per day.`
        }
      });
    }

    if (sender.balance < amount) {
      return res.status(200).json({
        type: 4,
        data: { content: "You don't have enough trees for that." }
      });
    }

    await safeBalanceUpdate(userId, guildId, -amount);
    await safeBalanceUpdate(target, guildId, amount);

    await users.updateOne(
      { userId, guildId },
      {
        $set: { lastTransferTime: new Date() },
        $inc: { transferTotal: amount }
      }
    );

    return res.status(200).json({
      type: 4,
      data: {
        content: `You gave **${amount.toLocaleString()} trees** to <@${target}>! <:tree:1483739101986291862>`
      }
    });
  }

  if (name === "balance") {
    const user = await getUser(userId, username, guildId);

    return res.status(200).json({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          {
            color: 0x9EB5FF,
            description: `${username}'s Balance: ${user.balance.toLocaleString()} trees <:tree:1483739101986291862>`
          }
        ]
      }
    });
  }

  if (name === "daily") {
    const user = await getUser(userId, username, guildId);
    const cooldown = 86400000;
    const left = cooldownLeft(user.lastDaily, cooldown);

    if (left > 0) {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          content: `The forest needs time to recover. Come back in \`${formatTime(left)}\``
        }
      });
    }

    const reward = rand(2000, 3500);

    await safeBalanceUpdate(userId, guildId, reward);
    await setField(userId, guildId, "lastDaily", new Date());

    return res.status(200).json({
      type: 4,
      data: {
        content: `You claimed your daily reward of \`${reward.toLocaleString()}\` trees! <:tree:1483739101986291862>`
      }
    });
  }

  if (name === "forage") {
    const user = await getUser(userId, username, guildId);
    const left = cooldownLeft(user.lastBake, BAKE_COOLDOWN);

    if (left > 0) {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              color: 0xD1ACA5,
              description: `Cut again in ${formatTime(left)}`
            }
          ]
        }
      });
    }

    const item = rollBake();

    await safeBalanceUpdate(userId, guildId, item.cookies);
    await setField(userId, guildId, "lastBake", new Date());

    return res.status(200).json({
      type: 4,
      data: {
        embeds: [
          {
            color: 0xBD9881,
            description: `You foraged and found ${item.name} worth ${item.cookies} trees <:tree:1483739101986291862>`
          }
        ]
      }
    });
  }

  if (name === "gamble") {
    const amount = body.data.options.find(o => o.name === "amount").value;
    const user = await getUser(userId, username, guildId);

    if (amount <= 0) {
      return res.status(200).json({
        type: 4,
        data: { content: "Amount must be greater than 0." }
      });
    }

    if (user.balance < amount) {
      return res.status(200).json({
        type: 4,
        data: { content: "You don't have enough trees for that." }
      });
    }

    const win = Math.random() < 0.5;

    if (win) {
      const reward = amount * 2;
      await safeBalanceUpdate(userId, guildId, amount);

      return res.status(200).json({
        type: 4,
        data: {
          content: `You grew your forest and earned \`${reward.toLocaleString()}\` trees! <:tree:1483739101986291862>`
        }
      });
    } else {
      await safeBalanceUpdate(userId, guildId, -amount);

      return res.status(200).json({
        type: 4,
        data: {
          content: `Your forest withered \`${amount.toLocaleString()}\` trees. <:tree:1483739101986291862>`
        }
      });
    }
  }
if (name === "reset") {
  const permissions = BigInt(body.member?.permissions || 0);
  const ADMIN = 0x8n;

  if ((permissions & ADMIN) !== ADMIN) {
    return res.status(200).json({
      type: 4,
      data: {
        flags: 64,
        content: "Only administrators can reset the leaderboard."
      }
    });
  }

  const db = await getDB();
  const users = db.collection("users");

  await users.updateMany({ guildId }, { $set: { balance: 0 } });

  return res.status(200).json({
    type: 4,
    data: {
      flags: 64,
      content: "Leaderboard for this server has been reset."
    }
  });
}

if (name === "leaderboard") {
  const db = await getDB();
  const usersCollection = db.collection("users");

  const topUsers = await usersCollection
    .find({ guildId, balance: { $gt: 0 } })
    .sort({ balance: -1 })
    .limit(10)
    .toArray();

  if (topUsers.length === 0) {
    return res.status(200).json({
      type: 4,
      data: {
        embeds: [
          {
            color: 0x3a3b40,
            title: "Leaderboard",
            description: "No one was ranked."
          }
        ]
      }
    });
  }

  let rows = "";
  for (let i = 0; i < topUsers.length; i++) {
    const u = topUsers[i];
    rows += `${i + 1}. <@${u.userId}> • \`${u.balance.toLocaleString()}\` <:tree:1483739101986291862>\n`;
  }

  const currentUser = await getUser(userId, username, guildId);

  if (currentUser.balance <= 0) {
    return res.status(200).json({
      type: 4,
      data: {
        embeds: [
          {
            color: 0x3a3b40,
            title: "Leaderboard",
            description: `${rows}\n\n-# You are not ranked yet.`
          }
        ]
      }
    });
  }

  const rank =
    (await usersCollection.countDocuments({
      guildId,
      balance: { $gt: currentUser.balance }
    })) + 1;

  const isTop10 = rank <= 10;

  let rankText = "";

  if (isTop10) {
    rankText = `-# Congratulations! You are currently ranked **#${rank}**!`;
  } else {
    rankText = `-# You are ranked **#${rank}** <:tree:1483739101986291862>.`;
  }

  return res.status(200).json({
    type: 4,
    data: {
      embeds: [
        {
          color: 0x3a3b40,
          title: "Leaderboard",
          description: `${rows}\n${rankText}`
        }
      ]
    }
  });
}

  return res.status(200).json({
    type: 4,
    data: { content: "Unknown command" }
  });
}
