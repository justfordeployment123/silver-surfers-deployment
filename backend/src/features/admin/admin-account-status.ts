import User from '../../models/user.model.ts';

export type AdminAccountStatus = 'active' | 'suspended';

export function parseAccountStatusFilter(value: unknown): AdminAccountStatus | null {
  const normalized = String(value || 'all').trim().toLowerCase();
  if (!normalized || normalized === 'all') return null;
  if (normalized === 'active' || normalized === 'suspended') return normalized;
  return null;
}

export async function getUserIdsForAccountStatus(status: AdminAccountStatus): Promise<unknown[]> {
  const accountQuery = status === 'active'
    ? { $or: [{ accountStatus: 'active' }, { accountStatus: { $exists: false } }] }
    : { accountStatus: 'suspended' };

  return User.find(accountQuery).distinct('_id');
}

export async function addAccountStatusToScans<T extends Record<string, unknown>>(items: T[]): Promise<Array<T & { accountStatus: string }>> {
  const userIds = [...new Set(items.map((item) => String(item.user || '')).filter(Boolean))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select({ accountStatus: 1 }).lean()
    : [];
  const statusByUserId = new Map(
    (users as Array<{ _id: unknown; accountStatus?: string }>).map((user) => [
      String(user._id),
      String(user.accountStatus || 'active').toLowerCase(),
    ]),
  );

  return items.map((item) => ({
    ...item,
    accountStatus: item.user ? (statusByUserId.get(String(item.user)) || 'active') : 'not_applicable',
  }));
}
