import { db, storage } from "hatchable";
import { Buffer } from "node:buffer";

// Journal data belongs to the signed-in app end user. The table's own-row
// policy scopes reads and writes automatically using the authenticated user ID.
export const access = "user";
export const methods = ["GET", "PUT"];

export default async function (req, res) {
  try {
    const ownerId = String(req.user?.id || "");
    if (!ownerId) return res.status(401).json({ error: "A signed-in journal user is required." });
    if (req.method === "GET") {
      const { rows } = await db.query(
        "SELECT payload, updated_at FROM journal_data WHERE owner_id = $1",
        [ownerId]
      );
      const candidate = rows[0]?.payload;
      const stored = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : null;
      const storedTrades = Array.isArray(stored?.trades) ? stored.trades : [];
      const mediaPrefixes = ["trade-media/user-" + Buffer.from(ownerId).toString("base64url") + "/"];
      if (req.member?.id != null) mediaPrefixes.push("trade-media/" + String(req.member.id) + "/");
      const payload = stored ? {
        ...stored,
        trades: await Promise.all(storedTrades.filter(trade => trade && typeof trade === "object" && !Array.isArray(trade)).map(async trade => ({
          ...trade,
          media: await Promise.all((Array.isArray(trade.media) ? trade.media : []).filter(file => file && typeof file === "object" && typeof file.key === "string" && mediaPrefixes.some(prefix => file.key.startsWith(prefix))).map(async file => ({
            ...file,
            url: await storage.url(file.key).catch(() => null)
          })))
        })))
      } : null;

      return res.json({
        payload,
        updatedAt: rows[0]?.updated_at || null,
        ownerId
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
    if (Buffer.byteLength(serialized, "utf8") > 2_000_000) {
      return res.status(413).json({ error: "Journal backup is too large." });
    }
    // Bind the row owner explicitly. This keeps inserts/upserts aligned with
    // the end-user identity enforced by the table's own-row policy.
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