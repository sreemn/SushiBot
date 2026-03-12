import nacl from "tweetnacl";

export const config = {
  api: {
    bodyParser: false
  }
};

const APP_ID = process.env.APP_ID;
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_KEY = process.env.PUBLIC_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  let rawBody = "";
  await new Promise((resolve) => {
    req.on("data", chunk => rawBody += chunk);
    req.on("end", resolve);
  });

  const isVerified = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  );

  if (!isVerified) {
    return res.status(401).send("Invalid request signature");
  }

  const body = JSON.parse(rawBody);

  if (body.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  if (body.type === 2) {
    const name = body.data.name;

    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              color: 0x3a3b40,
              description:
                "If you're just looking for info about how the bot works, a command list or clarification about something - check the /about command.\n\n" +
                "If that's not enough, join our Discord server for announcements and support."
            }
          ]
        }
      });
    }

    if (name === "balance") {
      const user = body.member?.user || body.user;
      const username = user.username;

      const balance = 0;

      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [
            {
              color: 0xac78f3,
              description: `${username}'s Balance: ${balance} 🪙`
            }
          ]
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
              description:
                "**How to Play**\n" +
                "To start playing, an admin must use the commands available in this bot and set up your server's experience. Once configured, members can interact with the bot commands and enjoy the features together.",
              footer: {
                text: "This bot was made by <@783891446905438260>."
              }
            }
          ]
        }
      });
    }
  }

  return res.status(200).json({
    type: 4,
    data: {
      content: "Unknown command"
    }
  });
}
