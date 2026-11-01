import { db, storage } from "hatchable";

export const access = "member";
export const methods = ["GET", "PUT"];

export default async function (req, res) {
  try {
    const ownerId = req.member.id;

    if (req.method === "GET") {
      const { rows } = await db.query(
        "SELECT payload, updated_at FROM journal_data WHERE owner_id = $1",
        [ownerId]
      );
      const stored = rows[0]?.payload || null;
      const payload = stored ? {
        ...stored,
        trades: await Promise.all((stored.trades || []).map(async trade => ({
          ...trade,
          media: await Promise.all((trade.media || []).filter(file => file?.key).map(async file => ({
            ...file,
            url: await storage.url(file.key).catch(() => null)
          })))
        })))
      } : null;

      return res.json({
        payload,
        updatedAt: rows[0]?.updated_at || null
      });
    }

    const payload = req.body?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ error: "A valid journal payload is required." });
    }

    // Store stable object keys only. Presigned URLs expire and are reissued on GET.
    const persisted = {
      ...payload,
      trades: (payload.trades || []).map(trade => ({
        ...trade,
        media: (trade.media || []).filter(file => file?.key).map(({ url, ...file }) => file)
      }))
    };
    const serialized = JSON.stringify(persisted);
    if (serialized.length > 2_000_000) {
      return res.status(413).json({ error: "Journal backup is too large." });
    }

    const { rows } = await db.query(
      "INSERT INTO journal_data (owner_id, payload, updated_at) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (owner_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW() RETURNING updated_at",
      [ownerId, serialized]
    );

    return res.json({ ok: true, updatedAt: rows[0]?.updated_at || null });
  } catch (error) {
    console.error("Journal storage error:", error);
    return res.status(500).json({ error: "Unable to access journal storage." });
  }
}