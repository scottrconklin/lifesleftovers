import { deleteE2eUsers } from "./helpers/accounts";

/** After every e2e run: remove the test users (local database only). */
export default async function globalTeardown() {
  await deleteE2eUsers();
}
