import { db, storage } from "hatchable";
import { Buffer } from "node:buffer";

// Journal data belongs to the signed-in app end user. The table's own-row
// policy scopes reads and writes automatically using the authenticated user ID.
export const access = "user";
export const methods = ["GET", "PUT"];

export default async function (req, res) {
  try {
    if (!["GET", "PUT"].includes(req.method)) return res.status(405).json({ error: "Method not allowed." });
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
      const refreshMedia = async (files) => Promise.all(
        (Array.isArray(files) ? files : [])
          .filter(file => file && typeof file === "object" && typeof file.key === "string" && mediaPrefixes.some(prefix => file.key.startsWith(prefix)))
          .slice(0, 20)
          .map(async file => ({ ...file, url: await storage.url(file.key).catch(() => null) }))
      );
      const payload = stored ? {
        ...stored,
        trades: await Promise.all(storedTrades.filter(trade => trade && typeof trade === "object" && !Array.isArray(trade)).map(async trade => ({
          ...trade,
          media: await refreshMedia(trade.media),
          preEntryMedia: await refreshMedia(trade.preEntryMedia)
        })))
      } : null;

      return res.json({
        payload,
        updatedAt: rows[0]?.updated_at || null,
        ownerId
      });
    }

    const payload = req.body?.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !Array.isArray(payload.accounts) || !Array.isArray(payload.trades) || !Array.isArray(payload.playbook) || (payload.backtests != null && !Array.isArray(payload.backtests))) {
      return res.status(400).json({ error: "A valid journal payload with accounts, trades, playbook and optional backtests arrays is required." });
    }
    if (payload.accounts.length > 500 || payload.trades.length > 50000 || payload.playbook.length > 10000 || (payload.backtests || []).length > 50000) {
      return res.status(413).json({ error: "This journal contains too many records. Export a backup and split the import before saving." });
    }
    const validRecords = (items, label) => {
      const ids = new Set();
      for (const item of items) {
        if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || !item.id.trim() || item.id.length > 160 || ids.has(item.id)) {
          return label + " must contain records with unique, non-empty IDs.";
        }
        ids.add(item.id);
      }
      return "";
    };
    const accountError = validRecords(payload.accounts, "Accounts");
    const tradeError = validRecords(payload.trades, "Trades");
    const playbookError = validRecords(payload.playbook, "Playbook");
    const backtestError = validRecords(payload.backtests || [], "Backtests");
    if (accountError || tradeError || playbookError || backtestError) {
      return res.status(400).json({ error: accountError || tradeError || playbookError || backtestError });
    }
    if (payload.accounts.some(account => typeof account.name !== "string" || account.name.length > 200) ||
        payload.trades.some(trade => typeof trade.accountId !== "string" || trade.accountId.length > 160 || (trade.pnl != null && (!Number.isFinite(Number(trade.pnl)) || Math.abs(Number(trade.pnl)) > 1e12)))) {
      return res.status(400).json({ error: "An account name, trade account reference, or trade P&L value is invalid." });
    }

    // Store only this user's stable media keys. Presigned URLs expire and are reissued on GET.
    const mediaPrefixes = ["trade-media/user-" + Buffer.from(ownerId).toString("base64url") + "/"];
    if (req.member?.id != null) mediaPrefixes.push("trade-media/" + String(req.member.id) + "/");
    const cleanMedia = (files) => (Array.isArray(files) ? files : [])
      .filter(file => file && typeof file === "object" && typeof file.key === "string" && mediaPrefixes.some(prefix => file.key.startsWith(prefix)) && file.key.length <= 512)
      .slice(0, 20)
      .map(({ url, ...file }) => file);
    const persisted = {
      ...payload,
      trades: payload.trades.map(trade => ({
        ...trade,
        media: cleanMedia(trade?.media),
        preEntryMedia: cleanMedia(trade?.preEntryMedia)
      }))
    };
    const serialized = JSON.stringify(persisted);
    if (Buffer.byteLength(serialized, "utf8") > 2_000_000) {
      return res.status(413).json({ error: "Journal backup is too large." });
    }
    // The table own-row policy supplies the authenticated owner_id default.
    // Do not supply owner_id explicitly: doing so bypasses the policy default
    // and causes PostgreSQL to reject valid end-user writes.
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