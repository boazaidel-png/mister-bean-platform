import { initializeApp } from "firebase-admin/app";

initializeApp();

export { setUserPassword } from "./password.js";
export { onUserProfileWritten } from "./audit.js";
