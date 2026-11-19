import { deleteE2eUsers } from "./helpers/accounts";
import { deleteE2eAuctions } from "./helpers/auctions";

/** After every e2e run: remove test auctions and test users (local database only). */
export default async function globalTeardown() {
  await deleteE2eAuctions();
  await deleteE2eUsers();
}
