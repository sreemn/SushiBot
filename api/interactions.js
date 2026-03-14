import nacl from "tweetnacl";
import { MongoClient } from "mongodb";
import fetch from "node-fetch";

export const config = { api: { bodyParser: false } };

const APP_ID = process.env.APP_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const MONGODB_URI = process.env.sushi_MONGODB_URI;

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
  if (newBalance > 1000000000) return;

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

  const diff =
    cooldownMs - (Date.now() - new Date(lastUsed).getTime());

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

const BAKE_COOLDOWN = 15000;

const INGREDIENT_TABLE = [
  { name: "Flour", cookies: 3, chance: 30 },
  { name: "Milk", cookies: 8, chance: 25 },
  { name: "Sugar", cookies: 20, chance: 20 },
  { name: "Butter", cookies: 50, chance: 13 },
  { name: "Chocolate Chips", cookies: 120, chance: 8 },
  { name: "Vanilla Extract", cookies: 300, chance: 4 }
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

function doGamble() {

  const roll = rand(1, 100);

  if (roll <= 10) return { result: "jackpot", multiplier: 5 };
  if (roll <= 45) return { result: "win", multiplier: 2 };

  return { result: "lose", multiplier: 0 };
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

  if (!verified)
    return res.status(401).send("Invalid request signature");

  const body = JSON.parse(rawBody);

  if (body.type === 1)
    return res.status(200).json({ type: 1 });

  if (body.type !== 2)
    return res.status(200).end();

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
            color: 0x3b9cff,
            title: "About Fireside",
            description:
              "I'm a multipurpose Discord bot designed to make your server more fun and engaging!",
            fields: [
              {
                name: "Developer",
                value: "Sreeman",
                inline: true
              },
              {
                name: "Website",
                value: "[fireside.bot](https://fireside.bot)",
                inline: true
              }
            ],
            footer: {
              text: `Serving ${guildCount} guilds and ${userCount} users`
            }
          }
        ]
      }
    });
  }

  if (name === "ping") {

    const latency = Math.floor(Math.random() * 40) + 90;

    return res.status(200).json({
      type: 4,
      data: {
        content: `Pong! My heartbeat is \`${latency}ms\`! 💓`
      }
    });
  }

  if (name === "invite") {

    return res.status(200).json({
      type: 4,
      data: {
        content: "Click the button below to invite me to your server!",
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "Invite Me!",
                url: `https://discord.com/oauth2/authorize?client_id=1482044394109407373`
              }
            ]
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
            color: 0x7e73ff,
            title: "Tools & Info",
            description:
              "/about\n/help\n/ping\n/invite\n/balance\n/daily\n/bake\n/work\n/gamble\n/give\n/deposit\n/withdraw\n/rob\n/leaderboard\n/shop\n/buy\n/inventory",
            image: {
              url: "https://cdn.discordapp.com/attachments/1482244165114007582/1482275630170112000/Tools.png"
            }
          }
        ]
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
            color: 0xac78f3,
            description:
              `${username}'s Balance: ${user.balance.toLocaleString()} cookies 🍪`
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
          content:
            `Hold your horses! You can use that command again in \`${formatTime(left)}\``
        }
      });
    }

    const reward = rand(2000, 3500);

    await safeBalanceUpdate(userId, guildId, reward);

    await setField(
      userId,
      guildId,
      "lastDaily",
      new Date()
    );

    return res.status(200).json({
      type: 4,
      data: {
        content:
          `You claimed your daily reward of \`${reward.toLocaleString()}\` cookies! 🍪`
      }
    });
  }

  if (name === "bake") {

    const user = await getUser(userId, username, guildId);

    const left = cooldownLeft(user.lastBake, BAKE_COOLDOWN);

    if (left > 0) {

      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              color: 0xff4444,
              description:
                `Bake again in ${formatTime(left)}`
            }
          ]
        }
      });
    }

    const item = rollBake();

    await safeBalanceUpdate(
      userId,
      guildId,
      item.cookies
    );

    await setField(
      userId,
      guildId,
      "lastBake",
      new Date()
    );

    return res.status(200).json({
      type: 4,
      data: {
        embeds: [
          {
            color: 0xfaa61a,
            description:
              `You baked and found ${item.name} worth ${item.cookies} cookies 🍪`
          }
        ]
      }
    });
  }

  if (name === "leaderboard") {

    const db = await getDB();
    const usersCollection = db.collection("users");

    const topUsers = await usersCollection
      .find({ guildId })
      .sort({ balance: -1 })
      .limit(10)
      .toArray();

    let rows = "";

    for (let i = 0; i < topUsers.length; i++) {

      const u = topUsers[i];

      rows +=
        `${i + 1}. <@${u.userId}> - \`${u.balance.toLocaleString()}\`\n`;

    }

    const currentUser =
      await getUser(userId, username, guildId);

    const rank =
      (
        await usersCollection.countDocuments({
          guildId,
          balance: { $gt: currentUser.balance }
        })
      ) + 1;

    return res.status(200).json({
      type: 4,
      data: {
        embeds: [
          {
            color: 0x3a3b40,
            title: "Leaderboard",
            description:
              `${rows}\n-# You are currently ranked **#${rank}**!`
          }
        ]
      }
    });
  }

  return res.status(200).json({
    type: 4,
    data: {
      content: "Unknown command"
    }
  });
}
