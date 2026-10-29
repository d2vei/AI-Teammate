export function budgetFromBanner(line) {
  const m = /^Shared allowance: USD (\d+(?:\.\d+)?); used\/reserved USD (\d+\.\d{6})\. /.exec(line ?? '');
  if (!m) throw new Error('Native budget banner is missing or malformed');
  const authorizedCapUsd = Number(m[1]); const usedOrReservedUsd = Number(m[2]);
  if (!Number.isFinite(authorizedCapUsd) || authorizedCapUsd <= 0 || authorizedCapUsd > 5 || !Number.isFinite(usedOrReservedUsd)) throw new Error('Native budget metadata is invalid');
  return { authorizedCapUsd, usedOrReservedUsd };
}
