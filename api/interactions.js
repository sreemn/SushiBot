import nacl from "tweetnacl";
import { MongoClient } from "mongodb";

export const config = { api: { bodyParser: false } };

const PUBLIC_KEY = process.env.PUBLIC_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

let client;
let db;

const leaderboardCache = new Map();
const spamCache = new Map();
const robCooldown = new Map();

const DAILY_COOLDOWN = 86400000;
const MINE_COOLDOWN = 15000;
const WORK_COOLDOWN = 3600000;
const ROB_COOLDOWN = 300000;

const SHOP = {
  lock: { name: "Lock", price: 500 },
  pickaxe: { name: "Pickaxe", price: 300 },
  laptop: { name: "Laptop", price: 1200 }
};

const GEM_TABLE = [
  { name: "Stone", coins: 3, chance: 30 },
  { name: "Coal", coins: 8, chance: 25 },
  { name: "Iron", coins: 20, chance: 20 },
  { name: "Gold", coins: 50, chance: 13 },
  { name: "Diamond", coins: 120, chance: 8 },
  { name: "Stardust", coins: 300, chance: 4 }
];

async function getDB() {
  if (db) return db;

  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 50,
      minPoolSize: 5
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
        bank: 0,
        inventory: {},
        lastDaily: null,
        lastMine: null,
        lastWork: null,
        createdAt: new Date()
      },
      $set: { username }
    },
    { upsert: true, returnDocument: "after" }
  );

  return result.value;
}

async function transferWalletToBank(userId, guildId, amount) {
  const database = await getDB();
  const session = client.startSession();

  let result;

  await session.withTransaction(async () => {
    const users = database.collection("users");

    const user = await users.findOne(
      { userId, guildId },
      { session }
    );

    if (!user || user.balance < amount) {
      throw new Error("balance");
    }

    await users.updateOne(
      { userId, guildId },
      {
        $inc: {
          balance: -amount,
          bank: amount
        }
      },
      { session }
    );

    result = true;
  });

  await session.endSession();
  return result;
}

async function transferBankToWallet(userId, guildId, amount) {
  const database = await getDB();
  const session = client.startSession();

  let result;

  await session.withTransaction(async () => {
    const users = database.collection("users");

    const user = await users.findOne(
      { userId, guildId },
      { session }
    );

    if (!user || user.bank < amount) {
      throw new Error("bank");
    }

    await users.updateOne(
      { userId, guildId },
      {
        $inc: {
          bank: -amount,
          balance: amount
        }
      },
      { session }
    );

    result = true;
  });

  await session.endSession();
  return result;
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

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function cooldownLeft(last, cd) {
  if (!last) return 0;
  const left = cd - (Date.now() - new Date(last).getTime());
  return left > 0 ? left : 0;
}

function formatTime(ms) {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

function rollMine() {
  const roll = rand(1, 100);
  let cumulative = 0;

  for (const gem of GEM_TABLE) {
    cumulative += gem.chance;
    if (roll <= cumulative) return gem;
  }

  return GEM_TABLE[0];
}

function gamble() {
  const roll = rand(1, 100);

  if (roll <= 10) return { mult: 5 };
  if (roll <= 45) return { mult: 2 };

  return { mult: 0 };
}

function accountAgeDays(id) {
  const discordEpoch = 1420070400000;
  const timestamp = (BigInt(id) >> 22n) + BigInt(discordEpoch);
  return (Date.now() - Number(timestamp)) / 86400000;
}

function antiSpam(userId, cmd) {
  const key = userId + cmd;
  const now = Date.now();

  if (spamCache.has(key) && spamCache.get(key) > now) {
    return false;
  }

  spamCache.set(key, now + 2000);
  return true;
}

async function getLeaderboard(guildId) {
  const cache = leaderboardCache.get(guildId);

  if (cache && cache.expires > Date.now()) {
    return cache.data;
  }

  const database = await getDB();
  const users = database.collection("users");

  const top = await users
    .find({ guildId })
    .sort({ balance: -1 })
    .limit(10)
    .toArray();

  leaderboardCache.set(guildId, {
    data: top,
    expires: Date.now() + 60000
  });

  return top;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  let raw = "";

  await new Promise(resolve => {
    req.on("data", chunk => raw += chunk);
    req.on("end", resolve);
  });

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  const verified = nacl.sign.detached.verify(
    Buffer.from(timestamp + raw),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  );

  if (!verified) return res.status(401).send("invalid request");

  const body = JSON.parse(raw);

  if (body.type === 1) return res.json({ type: 1 });
  if (body.type !== 2) return res.end();

  const name = body.data.name;
  const user = body.member?.user || body.user;

  const userId = user.id;
  const username = user.username;
  const guildId = body.guild_id;

  if (!antiSpam(userId, name)) {
    return res.json({ type: 4, data: { content: "Slow down" } });
  }

  if (accountAgeDays(userId) < 1) {
    return res.json({ type: 4, data: { content: "Account too new" } });
  }

  try {

    if (name === "balance") {
      const u = await getUser(userId, username, guildId);

      return res.json({
        type: 4,
        data: {
          content: `Wallet: ${u.balance} | Bank: ${u.bank}`
        }
      });
    }

    if (name === "daily") {
      const u = await getUser(userId, username, guildId);

      const left = cooldownLeft(u.lastDaily, DAILY_COOLDOWN);

      if (left > 0) {
        return res.json({
          type: 4,
          data: { content: `Come back in ${formatTime(left)}` }
        });
      }

      const reward = rand(150, 350);

      await changeBalance(userId, guildId, reward);

      const database = await getDB();
      await database.collection("users").updateOne(
        { userId, guildId },
        { $set: { lastDaily: new Date() } }
      );

      return res.json({
        type: 4,
        data: { content: `You received ${reward}` }
      });
    }

    if (name === "mine") {
      const u = await getUser(userId, username, guildId);

      const left = cooldownLeft(u.lastMine, MINE_COOLDOWN);

      if (left > 0) {
        return res.json({
          type: 4,
          data: { content: `Mine again in ${formatTime(left)}` }
        });
      }

      const gem = rollMine();

      await changeBalance(userId, guildId, gem.coins);

      const database = await getDB();
      await database.collection("users").updateOne(
        { userId, guildId },
        { $set: { lastMine: new Date() } }
      );

      return res.json({
        type: 4,
        data: { content: `You found ${gem.name} worth ${gem.coins}` }
      });
    }

    if (name === "work") {
      const u = await getUser(userId, username, guildId);

      const left = cooldownLeft(u.lastWork, WORK_COOLDOWN);

      if (left > 0) {
        return res.json({
          type: 4,
          data: { content: `Work again in ${formatTime(left)}` }
        });
      }

      const reward = rand(80, 220);

      await changeBalance(userId, guildId, reward);

      const database = await getDB();
      await database.collection("users").updateOne(
        { userId, guildId },
        { $set: { lastWork: new Date() } }
      );

      return res.json({
        type: 4,
        data: { content: `You earned ${reward}` }
      });
    }

    if (name === "deposit") {
      const amount = parseInt(body.data.options?.[0]?.value);

      if (!Number.isSafeInteger(amount) || amount <= 0) {
        return res.json({ type: 4, data: { content: "Invalid amount" } });
      }

      await transferWalletToBank(userId, guildId, amount);

      return res.json({
        type: 4,
        data: { content: `Deposited ${amount}` }
      });
    }

    if (name === "withdraw") {
      const amount = parseInt(body.data.options?.[0]?.value);

      if (!Number.isSafeInteger(amount) || amount <= 0) {
        return res.json({ type: 4, data: { content: "Invalid amount" } });
      }

      await transferBankToWallet(userId, guildId, amount);

      return res.json({
        type: 4,
        data: { content: `Withdrew ${amount}` }
      });
    }

    if (name === "rob") {
      const targetId = body.data.options?.[0]?.value;

      if (!targetId || targetId === userId) {
        return res.json({ type: 4, data: { content: "Invalid target" } });
      }

      const now = Date.now();

      if (robCooldown.has(userId) && robCooldown.get(userId) > now) {
        const left = robCooldown.get(userId) - now;

        return res.json({
          type: 4,
          data: { content: `Rob again in ${formatTime(left)}` }
        });
      }

      robCooldown.set(userId, now + ROB_COOLDOWN);

      const target = await getUser(targetId, "Unknown", guildId);

      if (target.balance < 50) {
        return res.json({
          type: 4,
          data: { content: "Target too poor" }
        });
      }

      const success = rand(1, 100) <= 45;

      if (success) {
        const amount = rand(20, Math.min(300, target.balance));

        await changeBalance(targetId, guildId, -amount);
        await changeBalance(userId, guildId, amount);

        return res.json({
          type: 4,
          data: { content: `Robbed ${amount}` }
        });
      }

      const fine = rand(10, 80);

      await changeBalance(userId, guildId, -fine);

      return res.json({
        type: 4,
        data: { content: `Failed and lost ${fine}` }
      });
    }

    if (name === "leaderboard") {
      const top = await getLeaderboard(guildId);

      let rows = "";

      for (let i = 0; i < top.length; i++) {
        rows += `${i + 1}. <@${top[i].userId}> - ${top[i].balance}\n`;
      }

      return res.json({
        type: 4,
        data: {
          embeds: [
            {
              title: "Leaderboard",
              description: rows
            }
          ]
        }
      });
    }

    if (name === "shop") {
      let text = "";

      for (const id in SHOP) {
        text += `${id} - ${SHOP[id].price}\n`;
      }

      return res.json({
        type: 4,
        data: { content: text }
      });
    }

    if (name === "buy") {
      const id = body.data.options?.[0]?.value;
      const item = SHOP[id];

      if (!item) {
        return res.json({ type: 4, data: { content: "Item not found" } });
      }

      const u = await getUser(userId, username, guildId);

      if (u.balance < item.price) {
        return res.json({
          type: 4,
          data: { content: "Not enough coins" }
        });
      }

      await changeBalance(userId, guildId, -item.price);

      const database = await getDB();
      await database.collection("users").updateOne(
        { userId, guildId },
        { $inc: { [`inventory.${id}`]: 1 } }
      );

      return res.json({
        type: 4,
        data: { content: `Bought ${item.name}` }
      });
    }

    if (name === "inventory") {
      const u = await getUser(userId, username, guildId);

      let text = "";

      for (const item in u.inventory) {
        text += `${item} x${u.inventory[item]}\n`;
      }

      if (!text) text = "Empty";

      return res.json({
        type: 4,
        data: { content: text }
      });
    }

    return res.json({ type: 4, data: { content: "Unknown command" } });

  } catch (err) {
    console.error("COMMAND ERROR", err);

    return res.json({
      type: 4,
      data: { content: "Internal error" }
    });
  }
}
