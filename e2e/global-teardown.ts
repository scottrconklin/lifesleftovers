import { deleteE2eUsers } from "./helpers/accounts";
import { deleteE2eAuctions } from "./helpers/auctions";
import { deleteE2eCards } from "./helpers/payments";

/** After every e2e run: remove test auctions, test cards and test users (local database only). */
export default async function globalTeardown() {
  await deleteE2eAuctions();
  await deleteE2eCards();
  await deleteE2eUsers();
}
