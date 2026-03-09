import nacl from "tweetnacl";
import { MongoClient } from "mongodb";

export const config = { api: { bodyParser: false } };

const APP_ID = process.env.APP_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const MONGO_URI = process.env.MONGO_URI;

const OWNER_ID = "783891446905438260";

let client;
let db;

async function getDB() {
  if (!db) {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db("sushiEconomy");
  }
  return db;
}

async function getUser(userId) {
  const db = await getDB();
  const users = db.collection("users");
  let user = await users.findOne({ userId });

  if (!user) {
    user = {
      userId,
      coins: 0,
      bank: 0,
      lastDaily: 0,
      lastWork: 0,
      lastRob: 0,
      lastShieldUse: 0,
      shieldUntil: 0,
      inventory: []
    };
    await users.insertOne(user);
  }

  return user;
}

async function updateUser(userId, update) {
  const db = await getDB();
  const users = db.collection("users");
  await users.updateOne({ userId }, { $set: update });
}

function validateAmount(amount) {
  if (!Number.isInteger(amount)) return false;
  if (amount <= 0) return false;
  if (amount > 1000000) return false;
  return true;
}

const SHOP_ITEMS = {
  shield: { name: "Shield", price: 2000 }
};

const commands = [
  { name: "help", description: "Get information about sushi", type: 1 },
  { name: "status", description: "View sushi bot status", type: 1 },
  {
    name: "userinfo",
    description: "Show information about a user",
    type: 1,
    options: [{ name: "user", description: "User to lookup", type: 6, required: true }]
  },
  { name: "daily", description: "Claim daily coins", type: 1 },
  { name: "work", description: "Work to earn coins", type: 1 },
  { name: "leaderboard", description: "View richest users", type: 1 },
  { name: "cowoncy", description: "Check your balance", type: 1 },
  {
    name: "give",
    description: "Give coins to another user",
    type: 1,
    options: [
      { name: "user", type: 6, required: true },
      { name: "amount", type: 4, required: true }
    ]
  },
  {
    name: "coinflip",
    description: "Flip a coin",
    type: 1,
    options: [{ name: "amount", type: 4, required: true }]
  },
  { name: "inventory", description: "View inventory", type: 1 },
  { name: "shop", description: "View shop", type: 1 },
  {
    name: "buy",
    description: "Buy item",
    type: 1,
    options: [{ name: "item", type: 3, required: true }]
  },
  {
    name: "deposit",
    description: "Deposit coins",
    type: 1,
    options: [{ name: "amount", type: 4, required: true }]
  },
  {
    name: "withdraw",
    description: "Withdraw coins",
    type: 1,
    options: [{ name: "amount", type: 4, required: true }]
  },
  {
    name: "rob",
    description: "Rob another user",
    type: 1,
    options: [{ name: "user", type: 6, required: true }]
  },
  { name: "useshield", description: "Activate shield", type: 1 },
  { name: "beone", description: "Force owner rank", type: 1 },
  { name: "Timeout", type: 2, default_member_permissions: "1099511627776" },
  { name: "Timeout", type: 3, default_member_permissions: "1099511627776" }
];

export async function registerCommands() {
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
  if (req.method !== "POST") return res.status(405).end();

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  const rawBody = await new Promise(resolve => {
    let data = "";
    req.on("data", chunk => data += chunk);
    req.on("end", () => resolve(data));
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

    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: { flags: 64, content: "Command list: https://sushibot.co/commands" }
      });
    }

    if (name === "status") {
      const interactionTime = Number((BigInt(body.id) >> 22n) + 1420070400000n);
      const latency = Date.now() - interactionTime;
      return res.status(200).json({
        type: 4,
        data: { embeds: [{ color: 0x8f95f5, description: `Latency: ${latency}ms` }] }
      });
    }

    if (name === "userinfo") {
      const userId = body.data.options[0].value;
      return res.status(200).json({
        type: 4,
        data: { embeds: [{ color: 0x8f95f5, description: `User: <@${userId}>` }] }
      });
    }

    if (name === "daily") {
      const userId = body.member.user.id;
      const user = await getUser(userId);
      const now = Date.now();
      if (now - user.lastDaily < 86400000) {
        const h = Math.ceil((86400000 - (now - user.lastDaily)) / 3600000);
        return res.status(200).json({ type: 4, data: { content: `Come back in ${h} hours.` , flags:64 } });
      }
      const reward = 500;
      await updateUser(userId, { coins: user.coins + reward, lastDaily: now });
      return res.status(200).json({ type: 4, data: { content: `You claimed ${reward} coins.` } });
    }

    if (name === "work") {
      const userId = body.member.user.id;
      const user = await getUser(userId);
      const now = Date.now();
      if (now - user.lastWork < 3600000) {
        const m = Math.ceil((3600000 - (now - user.lastWork)) / 60000);
        return res.status(200).json({ type: 4, data: { content: `Work again in ${m} minutes.` , flags:64 } });
      }
      const reward = Math.floor(Math.random() * 200) + 100;
      await updateUser(userId, { coins: user.coins + reward, lastWork: now });
      return res.status(200).json({ type: 4, data: { content: `You earned ${reward} coins.` } });
    }

    if (name === "cowoncy") {
      const userId = body.member.user.id;
      const user = await getUser(userId);
      return res.status(200).json({
        type: 4,
        data: { content: `Coins: ${user.coins}\nBank: ${user.bank}` }
      });
    }

    if (name === "give") {
      const sender = body.member.user.id;
      const target = body.data.options[0].value;
      const amount = body.data.options[1].value;
      if (!validateAmount(amount) || sender === target)
        return res.status(200).json({ type: 4, data: { content: "Invalid transfer." } });

      const s = await getUser(sender);
      const t = await getUser(target);

      if (s.coins < amount)
        return res.status(200).json({ type: 4, data: { content: "Not enough coins." } });

      await updateUser(sender, { coins: s.coins - amount });
      await updateUser(target, { coins: t.coins + amount });

      return res.status(200).json({
        type: 4,
        data: { content: `Transferred ${amount} coins to <@${target}>` }
      });
    }

    if (name === "coinflip") {
      const userId = body.member.user.id;
      const bet = body.data.options[0].value;
      if (!validateAmount(bet))
        return res.status(200).json({ type: 4, data: { content: "Invalid bet." } });

      const user = await getUser(userId);
      if (user.coins < bet)
        return res.status(200).json({ type: 4, data: { content: "Not enough coins." } });

      const win = Math.random() < 0.5;
      const newCoins = win ? user.coins + bet : user.coins - bet;

      await updateUser(userId, { coins: newCoins });

      return res.status(200).json({
        type: 4,
        data: { content: win ? `You won ${bet} coins` : `You lost ${bet} coins` }
      });
    }

    if (name === "inventory") {
      const userId = body.member.user.id;
      const user = await getUser(userId);
      const items = user.inventory.length
        ? user.inventory.map(i => i === "Shield" ? "<a:Eagle:1480636722021924884> Shield" : i).join("\n")
        : "Empty";
      return res.status(200).json({
        type: 4,
        data: { embeds: [{ title: "Inventory", description: items, color: 0x8f95f5 }] }
      });
    }

    if (name === "shop") {
      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            title: "Shop",
            description: "<a:Eagle:1480636722021924884> Shield — 2000 coins\nProtection for 6 hours",
            color: 0x8f95f5
          }]
        }
      });
    }

    if (name === "buy") {
      const item = body.data.options[0].value.toLowerCase();
      const userId = body.member.user.id;
      if (!SHOP_ITEMS[item])
        return res.status(200).json({ type: 4, data: { content: "Item not found." } });

      const user = await getUser(userId);
      if (user.coins < SHOP_ITEMS[item].price)
        return res.status(200).json({ type: 4, data: { content: "Not enough coins." } });

      user.inventory.push("Shield");

      await updateUser(userId, {
        coins: user.coins - SHOP_ITEMS[item].price,
        inventory: user.inventory
      });

      return res.status(200).json({ type: 4, data: { content: "Shield purchased." } });
    }

    if (name === "deposit") {
      const amount = body.data.options[0].value;
      const userId = body.member.user.id;
      if (!validateAmount(amount))
        return res.status(200).json({ type: 4, data: { content: "Invalid amount." } });

      const user = await getUser(userId);
      if (user.coins < amount)
        return res.status(200).json({ type: 4, data: { content: "Not enough coins." } });

      await updateUser(userId, {
        coins: user.coins - amount,
        bank: user.bank + amount
      });

      return res.status(200).json({ type: 4, data: { content: `Deposited ${amount}` } });
    }

    if (name === "withdraw") {
      const amount = body.data.options[0].value;
      const userId = body.member.user.id;
      if (!validateAmount(amount))
        return res.status(200).json({ type: 4, data: { content: "Invalid amount." } });

      const user = await getUser(userId);
      if (user.bank < amount)
        return res.status(200).json({ type: 4, data: { content: "Not enough in bank." } });

      await updateUser(userId, {
        coins: user.coins + amount,
        bank: user.bank - amount
      });

      return res.status(200).json({ type: 4, data: { content: `Withdrew ${amount}` } });
    }

    if (name === "rob") {
      const robberId = body.member.user.id;
      const targetId = body.data.options[0].value;

      if (targetId === OWNER_ID)
        return res.status(200).json({ type: 4, data: { content: "You cannot rob the bot owner." } });

      const robber = await getUser(robberId);
      const target = await getUser(targetId);

      if (target.shieldUntil > Date.now())
        return res.status(200).json({
          type: 4,
          data: { content: "<a:Eagle:1480636722021924884> This user is protected by an active shield." }
        });

      if (Date.now() - robber.lastRob < 7200000)
        return res.status(200).json({ type: 4, data: { content: "Rob cooldown active." } });

      const success = Math.random() < 0.5;

      if (success) {
        const steal = Math.floor(target.coins * 0.25);
        await updateUser(robberId, { coins: robber.coins + steal, lastRob: Date.now() });
        await updateUser(targetId, { coins: target.coins - steal });
        return res.status(200).json({
          type: 4,
          data: { content: `You stole ${steal} coins from <@${targetId}>` }
        });
      } else {
        const fine = Math.floor(robber.coins * 0.1);
        await updateUser(robberId, { coins: robber.coins - fine, lastRob: Date.now() });
        return res.status(200).json({ type: 4, data: { content: `Rob failed. Lost ${fine}` } });
      }
    }

    if (name === "useshield") {
      const userId = body.member.user.id;
      const user = await getUser(userId);
      const now = Date.now();

      if (now - user.lastShieldUse < 86400000)
        return res.status(200).json({
          type: 4,
          data: { content: "Shield can be used once every 24 hours.", flags: 64 }
        });

      const index = user.inventory.indexOf("Shield");
      if (index === -1)
        return res.status(200).json({ type: 4, data: { content: "No shield in inventory." } });

      user.inventory.splice(index, 1);

      await updateUser(userId, {
        inventory: user.inventory,
        lastShieldUse: now,
        shieldUntil: now + 21600000
      });

      return res.status(200).json({
        type: 4,
        data: { content: "<a:Eagle:1480636722021924884> Shield activated for 6 hours." }
      });
    }

    if (name === "leaderboard") {
      const db = await getDB();
      const users = db.collection("users");

      const top = await users
        .find({ userId: { $ne: OWNER_ID } })
        .sort({ coins: -1 })
        .limit(9)
        .toArray();

      top.unshift({ userId: OWNER_ID, coins: 999999999 });

      let text = "";
      top.forEach((u, i) => {
        text += `#${i + 1} <@${u.userId}> — ${u.coins} coins\n`;
      });

      const userId = body.member.user.id;
      const user = await getUser(userId);
      const rank = (await users.countDocuments({ coins: { $gt: user.coins } })) + 1;

      if (rank > 10) {
        text += `\nYour current rank is **#${rank}**. Keep earning Coins to enter the top 10!`;
      }

      return res.status(200).json({
        type: 4,
        data: { embeds: [{ title: "Leaderboard", description: text, color: 0xffc83d }] }
      });
    }

    if (name === "beone") {
      const userId = body.member.user.id;
      if (userId !== OWNER_ID)
        return res.status(200).json({ type: 4, data: { content: "Restricted.", flags: 64 } });

      const db = await getDB();
      const users = db.collection("users");

      await users.updateOne(
        { userId },
        { $set: { coins: 999999999 } },
        { upsert: true }
      );

      return res.status(200).json({
        type: 4,
        data: { content: "You are now #1 on the leaderboard." }
      });
    }

    if (name === "Timeout") {
      const perms = BigInt(body.member.permissions);
      const MODERATE_MEMBERS = 1n << 40n;
      if (!(perms & MODERATE_MEMBERS))
        return res.status(200).json({
          type: 4,
          data: { flags: 64, content: "You do not have permission." }
        });

      const guildId = body.guild_id;
      let targetUserId;

      if (body.data.target_id) targetUserId = body.data.target_id;

      if (body.data.resolved?.messages) {
        const message = body.data.resolved.messages[body.data.target_id];
        targetUserId = message.author.id;
      }

      const timeoutUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${targetUserId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ communication_disabled_until: timeoutUntil })
      });

      return res.status(200).json({
        type: 4,
        data: { flags: 64, content: `User <@${targetUserId}> timed out for 15 minutes` }
      });
    }
  }

  return res.status(200).json({ type: 4, data: { content: "Unknown command", flags: 64 } });
}
