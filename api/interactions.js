export const config = {
  api: {
    bodyParser: true
  }
};

export default async function handler(req, res) {
  const body = req.body;
  if (body.type === 1) {
    return res.status(200).json({ type: 1 });
  }
  if (body.type === 2) {
    return res.status(200).json({
      type: 5
    });
  }
  return res.status(200).end();
}
