import nacl from "tweetnacl";
import fetch from "node-fetch";

export const config = {
  api: { bodyParser: false }
};

const APP_ID = process.env.APP_ID;
const PUBLIC_KEY = process.env.PUBLIC_KEY;

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  /* FAST BODY READ */
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");

  /* SIGNATURE VERIFY */
  const isVerified = nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, "hex"),
    Buffer.from(PUBLIC_KEY, "hex")
  );

  if (!isVerified) {
    return res.status(401).send("Invalid request signature");
  }

  const body = JSON.parse(rawBody);

  /* PING */
  if (body.type === 1) {
    return res.status(200).json({ type: 1 });
  }

  /* COMMANDS */
  if (body.type === 2) {

    const name = body.data.name;
    const options = body.data.options || [];
    const user = body.member?.user || body.user;

    /* HELP */
    if (name === "help") {
      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0x3a3b40,
            description:
              "If you're just looking for info about how the bot works, a command list or clarification about something - check the /about command.\n\n" +
              "If that's not enough, [join our Discord server](https://discord.gg/QkvahZ4yW3)."
          }]
        }
      });
    }

    /* BALANCE */
    if (name === "balance") {

      const username = user.username;

      return res.status(200).json({
        type: 4,
        data: {
          flags: 64,
          embeds: [{
            color: 0xac78f3,
            description: `${username}'s Balance: 0 🪙`
          }]
        }
      });
    }

    /* HUG */
    if (name === "hug") {

      const targetId = options?.[0]?.value;
      const authorId = user.id;

      /* fetch in parallel */
      const gifPromise = fetch("https://api.waifu.pics/sfw/hug").then(r => r.json());

      const data = await gifPromise;

      return res.status(200).json({
        type: 4,
        data: {
          content: `<@${authorId}> hugged <@${targetId}>`,
          embeds: [{
            color: 0xff7fb0,
            image: { url: data.url }
          }],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 2,
              label: "Hug Back",
              custom_id: `hugback_${targetId}_${authorId}`,
              emoji: {
                name: "Heart",
                id: "1396919562645143583"
              }
            }]
          }],
          allowed_mentions: {
            users: [authorId, targetId]
          }
        }
      });
    }
  }

  /* BUTTON INTERACTIONS */
  if (body.type === 3) {

    const id = body.data.custom_id;

    if (id.startsWith("hugback_")) {

      const [ , targetId, originalAuthorId ] = id.split("_");
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

      const data = await fetch("https://api.waifu.pics/sfw/hug").then(r => r.json());

      return res.status(200).json({
        type: 7,
        data: {
          content: `<@${clickerId}> hugged <@${originalAuthorId}> back!`,
          embeds: [{
            color: 0xff7fb0,
            image: { url: data.url }
          }],
          components: [{
            type: 1,
            components: [{
              type: 2,
              style: 2,
              label: "Hug Back",
              disabled: true,
              custom_id: id,
              emoji: {
                name: "Heart",
                id: "1396919562645143583"
              }
            }]
          }],
          allowed_mentions: {
            users: [clickerId, originalAuthorId]
          }
        }
      });
    }
  }

  /* FALLBACK */
  return res.status(200).json({
    type: 4,
    data: { content: "Unknown command" }
  });
}
