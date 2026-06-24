export function verifySyncSecret(url: URL, expectedSecret: string | undefined) {
  const secret = expectedSecret?.trim();

  if (!secret) {
    return false;
  }

  return url.searchParams.get("secret") === secret;
}
