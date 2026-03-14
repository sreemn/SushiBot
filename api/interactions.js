import nacl from "tweetnacl";
import { MongoClient } from "mongodb";

export const config = { api: { bodyParser: false } };

const PUBLIC_KEY = process.env.PUBLIC_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

let client;
let db;

async function getDB() {
  if (db) return db;
  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 50,
      minPoolSize: 5,
      maxIdleTimeMS: 30000
    });
    await client.connect();
  }
  db = client.db("discordbot");
  return db;
}

async function getUser(userId, username, guildId) {
  const database = await getDB();
  const users = database.collection("users");

  const result = await users.findOneAndUpdate(
    { userId, guildId },
    {
      $setOnInsert: {
        userId,
        guildId,
        username,
        balance: 100,
        lastDaily: null,
        lastMine: null,
        createdAt: new Date()
      },
      $set: { username }
    },
    { upsert: true, returnDocument: "after" }
  );

  return result.value;
}

async function changeBalance(userId, guildId, amount) {
  const database = await getDB();
  const users = database.collection("users");

  const result = await users.findOneAndUpdate(
    {
      userId,
      guildId,
      balance: { $gte: amount < 0 ? Math.abs(amount) : 0 }
    },
    { $inc: { balance: amount } },
    { returnDocument: "after" }
  );

  return result.value;
}

async function setField(userId, guildId, field, value) {
  const database = await getDB();
  await database.collection("users").updateOne(
    { userId, guildId },
    { $set: { [field]: value } },
    { upsert: true }
  );
}

function cooldownLeft(lastUsed, cooldown) {
  if (!lastUsed) return 0;
  const left = cooldown - (Date.now() - new Date(lastUsed).getTime());
  return left > 0 ? left : 0;
}

function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const MINE_COOLDOWN = 15000;
const DAILY_COOLDOWN = 86400000;

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

  const verified = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  );

  if (!verified) return res.status(401).send("invalid request");

  const body = JSON.parse(rawBody);

  if (body.type === 1) return res.status(200).json({ type: 1 });

  if (body.type !== 2) return res.status(200).end();

  const name = body.data.name;
  const discordUser = body.member?.user || body.user;
  const userId = discordUser.id;
  const username = discordUser.username;
  const guildId = body.guild_id;

  try {

    if (name === "about") {
      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              color: 0x7e73ff,
              title: "Fireside's Help Menu",
              description:
                "I'm a bot designed to be a helpful and fun companion for your server. Choose a feature from the dropdown below to see what I can do!\n\nUse `/help [command]` for more details.",
              image: {
                url: "https://cdn.discordapp.com/attachments/1482244165114007582/1482275628861493321/HelpMenu.png?ex=69b65c41&is=69b50ac1&hm=8e6770623a777db1994b30deed862db6f78585026dd1a365de2687161f888fe3&"
              }
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
                "Helpful tools and information commands.\n\nUse `/help [command]` for more details.\n\n" +
                "**/about** - Shows information about the bot and how it works.\n" +
                "**/help** - Displays the help menu with all available commands.\n" +
                "**/balance** - Check your current coin balance.\n" +
                "**/daily** - Claim your daily coin reward.\n" +
                "**/mine** - Mine for resources to earn coins.\n" +
                "**/gamble** - Bet coins for a chance to win more.\n" +
                "**/give** - Send coins to another user.\n" +
                "**/leaderboard** - View the richest users in the server.",
              image: {
                url: "https://cdn.discordapp.com/attachments/1482244165114007582/1482275630170112000/Tools.png?ex=69b65c41&is=69b50ac1&hm=dedf983c9ea6c80b71f90002add39e7f3ccc8d39667047cf88f6e91539ee5015&"
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
          content: `${username}'s Balance: ${user.balance.toLocaleString()}`
        }
      });
    }

    if (name === "daily") {
      const user = await getUser(userId, username, guildId);
      const left = cooldownLeft(user.lastDaily, DAILY_COOLDOWN);

      if (left > 0) {
        return res.status(200).json({
          type: 4,
          data: { content: `You already claimed your daily reward. Come back in ${formatTime(left)}` }
        });
      }

      const reward = rand(150, 350);
      await changeBalance(userId, guildId, reward);
      await setField(userId, guildId, "lastDaily", new Date());

      return res.status(200).json({
        type: 4,
        data: { content: `You claimed your daily reward of \`${reward.toLocaleString()}\` coins!` }
      });
    }

    if (name === "mine") {
      const user = await getUser(userId, username, guildId);
      const left = cooldownLeft(user.lastMine, MINE_COOLDOWN);

      if (left > 0) {
        return res.status(200).json({
          type: 4,
          data: { content: `Mine again in ${formatTime(left)}` }
        });
      }

      const gem = rollMine();
      await changeBalance(userId, guildId, gem.coins);
      await setField(userId, guildId, "lastMine", new Date());

      return res.status(200).json({
        type: 4,
        data: { content: `You found ${gem.name} worth ${gem.coins}` }
      });
    }

    if (name === "gamble") {
      const user = await getUser(userId, username, guildId);
      const bet = parseInt(body.data.options?.find(o => o.name === "amount")?.value || 0);

      if (!bet || bet <= 0) {
        return res.status(200).json({ type: 4, data: { content: "Invalid bet amount" } });
      }

      if (bet > user.balance) {
        return res.status(200).json({ type: 4, data: { content: "Not enough coins" } });
      }

      const { result, multiplier } = doGamble();
      const winnings = bet * multiplier;
      const net = winnings - bet;

      await changeBalance(userId, guildId, net);

      if (result === "jackpot") {
        return res.status(200).json({ type: 4, data: { content: `Jackpot. You won ${winnings}` } });
      }

      if (result === "win") {
        return res.status(200).json({ type: 4, data: { content: `You doubled to ${winnings}` } });
      }

      return res.status(200).json({ type: 4, data: { content: `You lost ${bet}` } });
    }

    if (name === "give") {
      const user = await getUser(userId, username, guildId);
      const targetId = body.data.options?.find(o => o.name === "user")?.value;
      const amount = parseInt(body.data.options?.find(o => o.name === "amount")?.value || 0);

      if (!targetId || amount <= 0) {
        return res.status(200).json({ type: 4, data: { content: "Invalid usage" } });
      }

      if (targetId === userId) {
        return res.status(200).json({ type: 4, data: { content: "You cannot give coins to yourself" } });
      }

      if (amount > user.balance) {
        return res.status(200).json({ type: 4, data: { content: "You do not have enough coins" } });
      }

      await changeBalance(userId, guildId, -amount);
      await changeBalance(targetId, guildId, amount);

      return res.status(200).json({
        type: 4,
        data: { content: `You gave ${amount.toLocaleString()} to <@${targetId}>` }
      });
    }

    if (name === "leaderboard") {
      const database = await getDB();
      const users = database.collection("users");

      const topUsers = await users.find({ guildId }).sort({ balance: -1 }).limit(10).toArray();

      let rows = "";
      for (let i = 0; i < topUsers.length; i++) {
        const u = topUsers[i];
        rows += `${i + 1}. <@${u.userId}> - ${u.balance.toLocaleString()}\n`;
      }

      const currentUser = await getUser(userId, username, guildId);

      const rank =
        (await users.countDocuments({
          guildId,
          balance: { $gt: currentUser.balance }
        })) + 1;

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [
            {
              title: "Leaderboard",
              description: `${rows}\nYou are ranked #${rank}`
            }
          ]
        }
      });
    }

    return res.status(200).json({ type: 4, data: { content: "Unknown command" } });

  } catch {
    return res.status(200).json({ type: 4, data: { content: "Internal error" } });
  }
}
