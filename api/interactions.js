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

async function getUser(userId, username) {
  const db = await getDB();
  const users = db.collection("users");
  let user = await users.findOne({ userId });

  if (!user) {
    user = {
      userId,
      username,
      balance: 100,
      lastDaily: null,
      lastMine: null,
      createdAt: new Date()
    };
    await users.insertOne(user);
  } else if (user.username !== username) {
    await users.updateOne({ userId }, { $set: { username } });
  }

  return user;
}

async function safeBalanceUpdate(userId, amount) {
  const db = await getDB();
  const users = db.collection("users");
  const user = await users.findOne({ userId });
  if (!user) return;

  const newBalance = user.balance + amount;
  if (newBalance < 0) return;
  if (newBalance > 100000000) return;

  await users.updateOne({ userId }, { $set: { balance: newBalance } });
}

async function setField(userId, field, value) {
  const db = await getDB();
  await db.collection("users").updateOne(
    { userId },
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

const MINE_COOLDOWN = 45000;

const GEM_TABLE = [
  { name: "🪨 Stone", coins: 3, chance: 30 },
  { name: "🪵 Coal", coins: 8, chance: 25 },
  { name: "🔩 Iron", coins: 20, chance: 20 },
  { name: "🥇 Gold", coins: 50, chance: 13 },
  { name: "💎 Diamond", coins: 120, chance: 8 },
  { name: "🌟 Stardust", coins: 300, chance: 4 }
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
    req.on("data", chunk => (rawBody += chunk));
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

    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0x3a3b40,
            description:
              "If you're just looking for info about how the bot works, a command list or clarification about something — check the **/about** command.\n\n" +
              "If that's not enough, join our Discord server for announcements and support."
          }]
        }
      });
    }

    if (name === "about") {
      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              color: 0x3a3b40,
              title: "How to Play",
              description:
                "To start playing, an admin must use `/settings` and pick a name for your community. Then just take turns clicking the 🧩 button to keep playing!\n\n" +
                "[Get Support](https://discord.gg/4rv6P8xF8U) | " +
                "[Invite The Bot](https://discord.com/oauth2/authorize?client_id=1480495380041961483&permissions=8&integration_type=0&scope=bot+applications.commands) | " +
                "[Support us on ko-fi](https://ko-fi.com/sremn)",
              footer: {
                text: "This bot was made by sremn"
              }
            }
          ]
        }
      });
    }

    if (name === "balance") {
      const user = await getUser(userId, username);

      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0xac78f3,
            description: `${username}'s Balance: ${user.balance.toLocaleString()} 🪙`
          }]
        }
      });
    }

    if (name === "daily") {
      const user = await getUser(userId, username);
      const cooldown = 86400000;
      const left = cooldownLeft(user.lastDaily, cooldown);

      if (left > 0) {
        return res.status(200).json({
          type: 4,
          data: {
            flags: 64,
            embeds: [{
              color: 0xff4444,
              title: "⏳ Daily Already Claimed",
              description: `Come back in **${formatTime(left)}**`
            }]
          }
        });
      }

      const reward = rand(150, 350);
      await safeBalanceUpdate(userId, reward);
      await setField(userId, "lastDaily", new Date());

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0x57f287,
            title: "📅 Daily Reward",
            description: `You received **${reward} 🪙**`
          }]
        }
      });
    }

    if (name === "mine") {
      const user = await getUser(userId, username);
      const left = cooldownLeft(user.lastMine, MINE_COOLDOWN);

      if (left > 0) {
        return res.status(200).json({
          type: 4,
          data: {
            flags: 64,
            embeds: [{
              color: 0xff4444,
              title: "⏳ Pickaxe cooling down",
              description: `Mine again in **${formatTime(left)}**`
            }]
          }
        });
      }

      const gem = rollMine();
      await safeBalanceUpdate(userId, gem.coins);
      await setField(userId, "lastMine", new Date());

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0xfaa61a,
            title: "⛏️ Mining Results",
            description: `You found **${gem.name}** worth **${gem.coins} 🪙**`
          }]
        }
      });
    }

    if (name === "gamble") {
      const user = await getUser(userId, username);

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

      await safeBalanceUpdate(userId, net);

      let title, color, desc;

      if (result === "jackpot") {
        title = "🌟 JACKPOT";
        color = 0xffd700;
        desc = `You won **${winnings} 🪙**`;
      } else if (result === "win") {
        title = "🎰 You Won";
        color = 0x57f287;
        desc = `You doubled to **${winnings} 🪙**`;
      } else {
        title = "🎰 You Lost";
        color = 0xff4444;
        desc = `Lost **${bet} 🪙**`;
      }

      return res.status(200).json({
        type: 4,
        data: { embeds: [{ color, title, description: desc }] }
      });
    }

    if (name === "give") {
      const user = await getUser(userId, username);

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

      await safeBalanceUpdate(userId, -amount);
      await safeBalanceUpdate(targetId, amount);

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0x57f287,
            title: "💸 Coins Sent",
            description: `You gave **${amount.toLocaleString()} 🪙** to <@${targetId}>`
          }]
        }
      });
    }

if (name === "leaderboard") {
  const db = await getDB();

  const guildId = body.guild_id;

  const users = await db
    .collection("users")
    .find({})
    .sort({ balance: -1 })
    .toArray();

  const icons = ["🥇", "🥈", "🥉"];

  let rows = "";
  let rankIndex = 0;

  for (const user of users) {
    if (rankIndex >= 10) break;

    try {
      const r = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${user.userId}`,
        {
          headers: {
            Authorization: `Bot ${BOT_TOKEN}`
          }
        }
      );

      if (r.status !== 200) continue;

      let rank = rankIndex < 3 ? icons[rankIndex] : `\`#${rankIndex + 1}\``;

      rows += `${rank} - ${user.balance.toLocaleString()} 🪙 <@${user.userId}>\n`;

      rankIndex++;

    } catch {
      continue;
    }
  }

  if (!rows) rows = "No players yet.";

  return res.status(200).json({
    type: 4,
    data: {
      embeds: [
        {
          color: 0x3a3b40,
          title: "Most Experienced Gardeners",
          description: rows.trim()
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
