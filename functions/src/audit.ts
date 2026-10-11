import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWrittenWithAuthContext } from "firebase-functions/v2/firestore";
import type { UserProfile } from "../../lib/platform-types";
import { activeUsers, adminsOf, notifyOnce } from "./push";
import { DATABASE_REGION, writeAudit } from "./shared";

type Access = { role: string; status: string; accountIds: string[] };

const accessOf = (data: Partial<UserProfile> | undefined): Access | null => data
  ? { role: data.role || "", status: data.status || "", accountIds: data.accountIds || [] }
  : null;

const sameAccess = (left: Access | null, right: Access | null) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Every change to who may see what lands in the activity log, a user whose
 * access is revoked or removed is signed out of all devices right away, and
 * administrators hear about new access requests.
 */
export const onUserProfileWritten = onDocumentWrittenWithAuthContext(
  { document: "users/{uid}", region: DATABASE_REGION },
  async (event) => {
    const beforeData = event.data?.before.data() as UserProfile | undefined;
    const afterData = event.data?.after.data() as UserProfile | undefined;
    const before = accessOf(beforeData);
    const after = accessOf(afterData);
    if (sameAccess(before, after)) return;

    const uid = event.params.uid;
    const actorUid = event.authType === "system" ? "" : event.authId || "";
    const actor = actorUid && actorUid !== uid
      ? (await getFirestore().doc(`users/${actorUid}`).get()).data() as UserProfile | undefined
      : undefined;
    await writeAudit({
      action: !before ? "user-created" : !after ? "user-deleted" : "access-changed",
      actorUid,
      actorEmail: actor?.email || (actorUid === uid ? "המשתמש עצמו" : "מערכת"),
      targetUid: uid,
      targetEmail: afterData?.email || beforeData?.email || "",
      before,
      after,
    });

    if (after?.status === "pending" && before?.status !== "pending") {
      await notifyOnce(`access-request:${uid}:${afterData?.createdAt || ""}`, adminsOf(await activeUsers()), {
        title: "בקשת הרשאה חדשה",
        body: `${afterData?.displayName || afterData?.email} · ${afterData?.email}`,
        view: "access",
      }, actorUid === uid ? "" : actorUid);
    }

    const lostAccess = !after || (after.status === "revoked" && before?.status !== "revoked");
    if (lostAccess) {
      await getAuth().revokeRefreshTokens(uid).catch((error) => {
        if (error.code !== "auth/user-not-found") throw error;
      });
    }
  },
);
