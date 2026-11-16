export const formatFreeAccessDate = (value) =>
  new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export function describeFreeAccess(grant, now = new Date()) {
  const start = new Date(grant.startsAt);
  const end = formatFreeAccessDate(grant.endsAt);
  return start > now ? `Free access from ${formatFreeAccessDate(start)} to ${end}` : `Free access until ${end}`;
}

export function currentFreeAccess(grants = [], now = new Date()) {
  return grants
    .filter((grant) => grant?.endsAt && new Date(grant.endsAt) > now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}
