import { currentUser, json } from '../_lib.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  const user = await currentUser(request);
  if (!user) return json({ user: null });
  return json({ user });
}
