import { currentUser, send } from '../_lib.js';

export default async function handler(req, res) {
  const user = await currentUser(req);
  return send(res, { user: user || null });
}
