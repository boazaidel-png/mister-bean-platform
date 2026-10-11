import { initializeApp } from "firebase-admin/app";

initializeApp();

export { setUserPassword } from "./password";
export { onUserProfileWritten } from "./audit";
export { registerPushToken, unregisterPushToken } from "./push";
export { onOrderWritten, onTaskWritten, onTicketWritten } from "./notify";
export { dailyOperations } from "./daily";
