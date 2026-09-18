import { createServerFn } from "@tanstack/react-start";

type PreviewRequest = { shareToken?: string; resumeToken?: string };

// Only the server can sign files in the private bucket. The caller supplies a
// gallery capability or their personal resume capability, never a storage path.
export const getGalleryPreviews = createServerFn({ method: "GET" })
  .validator((input: PreviewRequest) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    let rows: Array<{ id: string; storage_path: string | null }> = [];

    if (data.resumeToken) {
      const { data: sessions, error } = await db.rpc("get_client_session_v1", { _resume_token: data.resumeToken });
      if (error) throw error;
      const session = sessions?.[0];
      if (!session?.photo_id) return [];
      const { data: photos, error: photoError } = await db.from("photos")
        .select("id,storage_path").eq("id", session.photo_id).limit(1);
      if (photoError) throw photoError;
      rows = photos ?? [];
    } else if (data.shareToken) {
      const { data: photos, error } = await db.rpc("get_gallery_photos_by_token", { _share_token: data.shareToken });
      if (error) throw error;
      rows = photos ?? [];
    } else {
      return [];
    }

    return await Promise.all(rows.map(async (row) => {
      const path = row.storage_path;
      if (!path) return { id: row.id, url: "" };
      if (/^https:\/\//.test(path) && !path.includes("/event-photos/")) return { id: row.id, url: path };
      const storagePath = path.includes("/event-photos/") ? path.split("/event-photos/")[1] ?? "" : path;
      if (!storagePath) return { id: row.id, url: "" };
      const { data: signed, error } = await supabaseAdmin.storage.from("event-photos")
        .createSignedUrl(storagePath, 15 * 60, { transform: { width: 600, quality: 70 } });
      if (error) throw error;
      return { id: row.id, url: signed?.signedUrl ?? "" };
    }));
  });
