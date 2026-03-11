import nacl from "tweetnacl";
import fetch from "node-fetch";

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
    const options = body.data.options || [];

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
                "If that's not enough, [join our Discord server](https://discord.gg/QkvahZ4yW3) where you can find announcements and customer support for all of our bots."
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
              description: `${username}'s Balance: ${balance} <a:Coin:1481390637755400333>`
            }
          ]
        }
      });
    }

    if (name === "hug") {
      const targetId = options[0].value;
      const authorId = body.member?.user?.id || body.user.id;

      const gif = await fetch("https://api.waifu.pics/sfw/hug");
      const data = await gif.json();

      return res.status(200).json({
        type: 4,
        data: {
          content: `<@${authorId}> hugged <@${targetId}>`,
          embeds: [
            {
              color: 0xff7fb0,
              image: {
                url: data.url
              }
            }
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  label: "Hug Back",
                  custom_id: `hugback_${targetId}_${authorId}`,
                  emoji: {
                    name: "Heart",
                    id: "1396919562645143583"
                  }
                }
              ]
            }
          ],
          allowed_mentions: {
            users: [authorId, targetId]
          }
        }
      });
    }
  }

  if (body.type === 3) {
    if (body.data.custom_id.startsWith("hugback_")) {
      const parts = body.data.custom_id.split("_");
      const targetId = parts[1];
      const originalAuthorId = parts[2];
      const clickerId = body.member?.user?.id || body.user.id;

      if (clickerId !== targetId) {
        return res.status(200).json({
          type: 4,
          data: {
            flags: 64,
            content: "This hug wasn't meant for you."
          }
        });
      }

      const gif = await fetch("https://api.waifu.pics/sfw/hug");
      const data = await gif.json();

      return res.status(200).json({
        type: 7,
        data: {
          content: `<@${clickerId}> hugged <@${originalAuthorId}> back!`,
          embeds: [
            {
              color: 0xff7fb0,
              image: {
                url: data.url
              }
            }
          ],
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 2,
                  label: "Hug Back",
                  disabled: true,
                  custom_id: `hugback_${targetId}_${originalAuthorId}`,
                  emoji: {
                    name: "Heart",
                    id: "1396919562645143583"
                  }
                }
              ]
            }
          ],
          allowed_mentions: {
            users: [clickerId, originalAuthorId]
          }
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
