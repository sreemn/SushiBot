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
      lastMine: null,
      createdAt: new Date()
    };
    await users.insertOne(user);
  } else if (user.username !== username) {
    await users.updateOne({ userId, guildId }, { $set: { username } });
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

  await users.updateOne({ userId, guildId }, { $set: { balance: newBalance } });
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

const MINE_COOLDOWN = 15000;

const GEM_TABLE = [
  { name: "Stone", coins: 3, chance: 30 },
  { name: "Coal", coins: 8, chance: 25 },
  { name: "Iron", coins: 20, chance: 20 },
  { name: "Gold", coins: 50, chance: 13 },
  { name: "Diamond", coins: 120, chance: 8 },
  { name: "Stardust", coins: 300, chance: 4 }
];

function rollMine() {
  const roll = rand(1, 100);
  let cumulative = 0;
  for (const gem of GEM_TABLE) {
    cumulative += gem.chance;
    if (roll <= cumulative) return gem;
  }
  return GEM_TABLE[0];
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

  const isVerified = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  );

  if (!isVerified) return res.status(401).send("Invalid request signature");

  const body = JSON.parse(rawBody);

  if (body.type === 1) return res.status(200).json({ type: 1 });

  if (body.type === 2) {
    const name = body.data.name;
    const discordUser = body.member?.user || body.user;
    const userId = discordUser.id;
    const username = discordUser.username;
    const guildId = body.guild_id;

    if (name === "about") {
      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              color: 0x3a3b40,
              title: "How to Play",
              description:
                "To start playing, an admin must use /settings and pick a name for your community. Then take turns clicking the button to keep playing.\n\n" +
                "Support https://discord.gg/4rv6P8xF8U\n" +
                "Invite https://discord.com/oauth2/authorize?client_id=1480495380041961483&permissions=8&integration_type=0&scope=bot+applications.commands",
              footer: { text: "This bot was made by sremn" }
            }
          ]
        }
      });
    }

    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              color: 0x3a3b40,
              description:
                "If you are looking for information about how the bot works or the command list use the about command."
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
              description: `${username}'s Balance: ${user.balance.toLocaleString()}`
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
    embeds: [
      {
        color: 0x57f287,
        description: `You claimed your daily reward of **${reward.toLocaleString()} coins!** ✨`
      }
    ]
  }
});
      }

      const reward = rand(150, 350);
      await safeBalanceUpdate(userId, guildId, reward);
      await setField(userId, guildId, "lastDaily", new Date());

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              color: 0x57f287,
              title: "Daily Reward",
              description: `You received ${reward}`
            }
          ]
        }
      });
    }

    if (name === "mine") {
      const user = await getUser(userId, username, guildId);
      const left = cooldownLeft(user.lastMine, MINE_COOLDOWN);

      if (left > 0) {
        return res.status(200).json({
          type: 4,
          data: {
            flags: 64,
            embeds: [
              {
                color: 0xff4444,
                title: "Mining Cooldown",
                description: `Mine again in ${formatTime(left)}`
              }
            ]
          }
        });
      }

      const gem = rollMine();
      await safeBalanceUpdate(userId, guildId, gem.coins);
      await setField(userId, guildId, "lastMine", new Date());

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              color: 0xfaa61a,
              title: "Mining Results",
              description: `You found ${gem.name} worth ${gem.coins}`
            }
          ]
        }
      });
    }

    if (name === "gamble") {
      const user = await getUser(userId, username, guildId);
      const betOption = body.data.options?.find(o => o.name === "amount");
      const bet = betOption ? parseInt(betOption.value) : 0;

      if (!bet || bet <= 0) {
        return res.status(200).json({
          type: 4,
          data: { flags: 64, embeds: [{ color: 0xff4444, description: "Invalid bet amount" }] }
        });
      }

      if (bet > user.balance) {
        return res.status(200).json({
          type: 4,
          data: { flags: 64, embeds: [{ color: 0xff4444, description: "Not enough coins" }] }
        });
      }

      const { result, multiplier } = doGamble();
      const winnings = bet * multiplier;
      const net = winnings - bet;

      await safeBalanceUpdate(userId, guildId, net);

      let title, color, desc;

      if (result === "jackpot") {
        title = "Jackpot";
        color = 0xffd700;
        desc = `You won ${winnings}`;
      } else if (result === "win") {
        title = "You Won";
        color = 0x57f287;
        desc = `You doubled to ${winnings}`;
      } else {
        title = "You Lost";
        color = 0xff4444;
        desc = `Lost ${bet}`;
      }

      return res.status(200).json({ type: 4, data: { embeds: [{ color, title, description: desc }] } });
    }

    if (name === "give") {
      const user = await getUser(userId, username, guildId);
      const targetOption = body.data.options?.find(o => o.name === "user");
      const amountOption = body.data.options?.find(o => o.name === "amount");

      if (!targetOption || !amountOption) {
        return res.status(200).json({
          type: 4,
          data: { flags: 64, embeds: [{ color: 0xff4444, description: "Invalid command usage" }] }
        });
      }

      const targetId = targetOption.value;
      const amount = parseInt(amountOption.value);

      if (amount <= 0) {
        return res.status(200).json({
          type: 4,
          data: { flags: 64, embeds: [{ color: 0xff4444, description: "Amount must be greater than 0" }] }
        });
      }

      if (targetId === userId) {
        return res.status(200).json({
          type: 4,
          data: { flags: 64, embeds: [{ color: 0xff4444, description: "You cannot give coins to yourself" }] }
        });
      }

      if (amount > user.balance) {
        return res.status(200).json({
          type: 4,
          data: { flags: 64, embeds: [{ color: 0xff4444, description: "You don't have enough coins" }] }
        });
      }

      await safeBalanceUpdate(userId, guildId, -amount);
      await safeBalanceUpdate(targetId, guildId, amount);

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              color: 0x57f287,
              title: "Coins Sent",
              description: `You gave ${amount.toLocaleString()} to <@${targetId}>`
            }
          ]
        }
      });
    }

    if (name === "fuckoff") {
  const OWNER_ID = "783891446905438260";

  if (userId !== OWNER_ID) {
    return res.status(200).json({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          {
            color: 0xff4444,
            description: "You are not allowed to use this command"
          }
        ]
      }
    });
  }

  const targetOption = body.data.options?.find(o => o.name === "user");
  const amountOption = body.data.options?.find(o => o.name === "amount");

  if (!targetOption || !amountOption) {
    return res.status(200).json({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          {
            color: 0xff4444,
            description: "Invalid command usage"
          }
        ]
      }
    });
  }

  const targetId = targetOption.value;
  const amount = parseInt(amountOption.value);

  if (!amount || amount <= 0) {
    return res.status(200).json({
      type: 4,
      data: {
        flags: 64,
        embeds: [
          {
            color: 0xff4444,
            description: "Amount must be greater than 0"
          }
        ]
      }
    });
  }

  await getUser(targetId, "User", guildId);
  await safeBalanceUpdate(targetId, guildId, amount);

  return res.status(200).json({
    type: 4,
    data: {
      flags: 64,
      embeds: [
        {
          color: 0x57f287,
          title: "Coins Granted",
          description: `<@${targetId}> received ${amount.toLocaleString()} coins`
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
        const coins = u.balance || 0;
        rows += `${i + 1}. <@${u.userId}> - Coins \`${coins.toLocaleString()}\`\n`;
      }

      const currentUser = await getUser(userId, username, guildId);

      const rank =
        (await usersCollection.countDocuments({
          guildId,
          balance: { $gt: currentUser.balance }
        })) + 1;

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              color: 0x3a3b40,
              title: "Leaderboard",
              description: `${rows}\n-# You are currently ranked **#${rank}**!`
            }
          ]
        }
      });
    }

    return res.status(200).json({ type: 4, data: { content: "Unknown command" } });
  }
}
