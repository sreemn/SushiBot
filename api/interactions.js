import nacl from "tweetnacl";
import fetch from "node-fetch";
import { MongoClient } from "mongodb";

export const config = {
  api: { bodyParser: false }
};

const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_KEY = process.env.PUBLIC_KEY;
const MONGODB_URI = process.env.MONGODB_URI;

let cachedClient = null;
async function getDB() {
  if (cachedClient) return cachedClient.db("discordbot");
  cachedClient = await MongoClient.connect(MONGODB_URI);
  return cachedClient.db("discordbot");
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
  }
  return user;
}

async function updateBalance(userId, amount) {
  const db = await getDB();
  await db.collection("users").updateOne({ userId }, { $inc: { balance: amount } });
}

async function setField(userId, field, value) {
  const db = await getDB();
  await db.collection("users").updateOne({ userId }, { $set: { [field]: value } });
}

let botAvatar = null;
async function getBotAvatar() {
  if (botAvatar) return botAvatar;
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bot ${BOT_TOKEN}` }
  });
  const data = await res.json();
  botAvatar = `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`;
  return botAvatar;
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

const MINE_COOLDOWN = 45 * 1000;
const GEM_TABLE = [
  { name: "🪨 Stone",    coins: 3,   chance: 30 },
  { name: "🪵 Coal",     coins: 8,   chance: 25 },
  { name: "🔩 Iron",     coins: 20,  chance: 20 },
  { name: "🥇 Gold",     coins: 50,  chance: 13 },
  { name: "💎 Diamond",  coins: 120, chance: 8  },
  { name: "🌟 Stardust", coins: 300, chance: 4  },
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

function doGamble(bet) {
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
  await new Promise((resolve) => {
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
              "**Economy Commands:**\n" +
              "`/balance` — Check your coins\n" +
              "`/daily` — Claim daily coins\n" +
              "`/top` — View the leaderboard\n\n" +
              "**Game Commands:**\n" +
              "`/mine` — Go mining ⛏️\n" +
              "`/gamble <amount>` — Risk your coins 🎰\n\n" +
              "If that's not enough, join our Discord server for announcements and support."
          }]
        }
      });
    }

    if (name === "about") {
      const avatar = await getBotAvatar();
      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0x3a3b40,
            title: "How to Play",
            description:
              "To start playing, an admin must use `/settings` and pick a name for your community. Then just take turns clicking the 🧩 button to keep playing!\n\n" +
              "[Get Support](https://discord.gg/4rv6P8xF8U) | " +
              "[Invite The Bot](https://discord.com/oauth2/authorize?client_id=1480495380041961483&permissions=8&integration_type=0&scope=bot+applications.commands) | " +
              "[Support us on ko-fi](https://ko-fi.com/sremn)",
            footer: { text: "This bot was made by sremn", icon_url: avatar }
          }]
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
      const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
      const left = cooldownLeft(user.lastDaily, DAILY_COOLDOWN);

      if (left > 0) {
        return res.status(200).json({
          type: 4,
          data: {
            flags: 64,
            embeds: [{
              color: 0xff4444,
              title: "⏳ Daily Already Claimed",
              description: `Come back in **${formatTime(left)}** to claim again.`
            }]
          }
        });
      }

      const reward = rand(150, 350);
      await updateBalance(userId, reward);
      await setField(userId, "lastDaily", new Date());

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0x57f287,
            title: "📅 Daily Reward",
            description:
              `You claimed your daily reward of **${reward} 🪙**!\n` +
              `New balance: **${(user.balance + reward).toLocaleString()} 🪙**`
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
              title: "⏳ Pickaxe is cooling down",
              description: `You can mine again in **${formatTime(left)}**.`
            }]
          }
        });
      }

      const gem = rollMine();
      await updateBalance(userId, gem.coins);
      await setField(userId, "lastMine", new Date());

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0xfaa61a,
            title: "⛏️ Mining Results",
            description:
              `You dug up **${gem.name}** worth **${gem.coins} 🪙**!\n` +
              `New balance: **${(user.balance + gem.coins).toLocaleString()} 🪙**`
          }]
        }
      });
    }

    if (name === "gamble") {
      const user = await getUser(userId, username);
      const bet = parseInt(body.data.options?.find(o => o.name === "amount")?.value);

      if (!bet || bet <= 0) {
        return res.status(200).json({
          type: 4,
          data: {
            flags: 64,
            embeds: [{ color: 0xff4444, description: "Please enter a valid bet amount." }]
          }
        });
      }

      if (bet > user.balance) {
        return res.status(200).json({
          type: 4,
          data: {
            flags: 64,
            embeds: [{
              color: 0xff4444,
              description: `❌ You only have **${user.balance.toLocaleString()} 🪙**. You can't bet **${bet.toLocaleString()} 🪙**.`
            }]
          }
        });
      }

      const { result, multiplier } = doGamble(bet);
      const winnings = bet * multiplier;
      const netChange = winnings - bet;
      const newBal = user.balance + netChange;

      let colorHex, title, desc;
      if (result === "jackpot") {
        colorHex = 0xffd700;
        title = "🌟 JACKPOT!";
        desc = `You hit the jackpot! Your **${bet.toLocaleString()} 🪙** became **${winnings.toLocaleString()} 🪙**!\n**+${netChange.toLocaleString()} 🪙** | New balance: **${newBal.toLocaleString()} 🪙**`;
      } else if (result === "win") {
        colorHex = 0x57f287;
        title = "🎰 You Won!";
        desc = `You doubled your bet! **${bet.toLocaleString()} 🪙** → **${winnings.toLocaleString()} 🪙**\n**+${netChange.toLocaleString()} 🪙** | New balance: **${newBal.toLocaleString()} 🪙**`;
      } else {
        colorHex = 0xff4444;
        title = "🎰 You Lost!";
        desc = `Bad luck! You lost **${bet.toLocaleString()} 🪙**.\nNew balance: **${newBal.toLocaleString()} 🪙**`;
      }

      await updateBalance(userId, netChange);

      return res.status(200).json({
        type: 4,
        data: { embeds: [{ color: colorHex, title, description: desc }] }
      });
    }

    if (name === "top") {
      const db = await getDB();
      const top = await db.collection("users")
        .find({})
        .sort({ balance: -1 })
        .limit(10)
        .toArray();

      const medals = ["🥇", "🥈", "🥉"];
      const rows = top.map((u, i) => {
        const rank = medals[i] || `\`#${i + 1}\``;
        return `${rank} - ${u.balance.toLocaleString()} 🪙 <@${u.userId}>`;
      }).join("\n");

      return res.status(200).json({
        type: 4,
        data: {
          embeds: [{
            color: 0x2b2d31,
            title: "Leaderboard",
            description: rows || "No users yet!"
          }]
        }
      });
    }
  }

  return res.status(200).json({
    type: 4,
    data: { content: "Unknown command" }
  });
}
