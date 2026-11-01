import { auth, storage } from "hatchable";
import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";

export const access = "public";
export const methods = ["POST", "DELETE"];

const MAX_BYTES = 8 * 1024 * 1024;
const TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

function validImage(buffer, type) {
  const b = buffer;
  if (type === "image/jpeg") return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === "image/png") return b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
  if (type === "image/webp") return b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
  if (type === "image/gif") {
    const signature = String.fromCharCode(...b.slice(0, 6));
    return signature === "GIF87a" || signature === "GIF89a";
  }
  return false;
}

export default async function (req, res) {
  try {
    // Preserve the original collaborator storage prefix; isolate app users.
    const memberId = req.member?.id;
    const user = memberId == null ? (req.user || await auth.getUser(req)) : null;
    if (memberId == null && !user?.id) {
      return res.status(401).json({ error: "login_required", message: "Please sign in before uploading trade images." });
    }
    const prefix = memberId != null
      ? "trade-media/" + String(memberId) + "/"
      : "trade-media/user-" + Buffer.from(String(user.id)).toString("base64url") + "/";

    if (req.method === "DELETE") {
      const key = String(req.body?.key || "");
      if (!key.startsWith(prefix)) return res.status(404).json({ error: "Media file not found." });
      await storage.del(key);
      return res.json({ ok: true });
    }

    let filename = "";
    let contentType = "";
    let buffer = null;

    const uploaded = (req.files || []).find(file => file.field === "file");
    if (uploaded) {
      filename = uploaded.filename || "trade-image";
      contentType = uploaded.contentType || "";
      buffer = uploaded.buffer;
    } else if (typeof req.body?.base64 === "string") {
      filename = String(req.body.filename || "trade-image");
      contentType = String(req.body.contentType || "");
      const encoded = req.body.base64.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
      if (encoded.length > Math.ceil(MAX_BYTES * 4 / 3) + 8) {
        return res.status(413).json({ error: "Image too large. Maximum size is 8 MB after compression." });
      }
      buffer = Buffer.from(encoded, "base64");
    }

    if (!buffer) return res.status(400).json({ error: "Choose an image to upload." });
    if (buffer.length > MAX_BYTES) return res.status(413).json({ error: "Image too large. Maximum size is 8 MB." });
    if (!TYPES[contentType] || !validImage(buffer, contentType)) {
      return res.status(415).json({ error: "Use a valid JPG, PNG, WEBP or GIF image." });
    }

    const key = prefix + randomUUID() + "." + TYPES[contentType];
    const url = await storage.put(key, buffer, contentType);
    return res.json({
      key,
      url,
      name: filename.replace(/[\\/]/g, "_").slice(0, 160),
      contentType,
      bytes: buffer.length
    });
  } catch (error) {
    console.error("Trade media upload failed:", error);
    return res.status(500).json({ error: "Unable to save this image. Please try again." });
  }
}