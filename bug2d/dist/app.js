export const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__";
export const HUB_URL = "__HUB_URL__";
export const APP_VERSION = "0.2.5";
import { mountTopbar, topbarIdlFactory } from './hub-client.js';
export { topbarIdlFactory };
export function mountSuite(el, options) { return mountTopbar(el, options); }
