/**
 * Fetch total seconds for a Hackatime project from the Hackatime API.
 * Returns 0 on any error or timeout.
 */
export async function fetchHackatimeProjectSeconds(
  hackatimeUserId: string,
  hackatimeProject: string,
): Promise<number> {
  try {
    const res = await fetch(
      `https://hackatime.hackclub.com/api/v1/users/${encodeURIComponent(hackatimeUserId)}/project/${encodeURIComponent(hackatimeProject)}`,
      { signal: AbortSignal.timeout(10_000) }
    )
    if (res.ok) {
      const data = await res.json()
      return data.total_seconds ?? 0
    }
  } catch {
    // ignore fetch/timeout errors
  }
  return 0
}
