import { db, storage } from "hatchable";

// Journal data belongs to the signed-in app end user. The table's own-row
// policy scopes reads and writes automatically using the authenticated user ID.
export const access = "user";
export const methods = ["GET", "PUT"];

export default async function (req, res) {
  try {
    if (req.method === "GET") {
      const { rows } = await db.query(
        "SELECT payload, updated_at FROM journal_data"
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
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.accounts) || !Array.isArray(payload.trades) || !Array.isArray(payload.playbook)) {
      return res.status(400).json({ error: "A valid journal payload with accounts, trades and playbook arrays is required." });
    }

    // Store stable object keys only. Presigned URLs expire and are reissued on GET.
    const persisted = {
      ...payload,
      trades: payload.trades.map(trade => ({
        ...trade,
        media: (Array.isArray(trade?.media) ? trade.media : []).filter(file => file?.key).map(({ url, ...file }) => file)
      }))
    };
    const serialized = JSON.stringify(persisted);
    if (serialized.length > 2_000_000) {
      return res.status(413).json({ error: "Journal backup is too large." });
    }

    const { rows } = await db.query(
      "INSERT INTO journal_data (payload, updated_at) VALUES ($1::jsonb, NOW()) ON CONFLICT (owner_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW() RETURNING updated_at",
      [serialized]
    );

    return res.json({ ok: true, updatedAt: rows[0]?.updated_at || null });
  } catch (error) {
    console.error("Journal storage error:", error);
    return res.status(500).json({ error: "Unable to access journal storage." });
  }
}