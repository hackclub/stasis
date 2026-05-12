/**
 * Send DMs as a real Slack user (not as a bot) using the user's xoxc token +
 * xoxd cookie. Mirrors the integration pattern from /home/augie/Code/slack-dmer.
 *
 * Tokens are NEVER stored at rest — they're passed in per-request by the
 * caller (typically an admin script). Each admin uses their own pair so the
 * DM appears to come from them in Slack.
 *
 * Workspace is hardcoded to hackclub.enterprise.slack.com because every
 * admin DMing for Stasis is in that workspace. Override via the optional
 * `instance` arg on each call if that ever stops being true.
 */

const DEFAULT_INSTANCE = "hackclub.enterprise.slack.com"

export interface UserDMTokens {
  xoxc: string
  xoxd: string
  instance?: string
}

interface SlackError {
  ok: false
  error: string
  status: number
}

interface OpenDMResult { channelId: string; alreadyOpen: boolean }
interface PostMessageResult { ts: string; channelId: string }

async function slackUserCall<T = unknown>(
  tokens: UserDMTokens,
  endpoint: string,
  form: URLSearchParams
): Promise<T> {
  form.set("token", tokens.xoxc)
  const instance = tokens.instance ?? DEFAULT_INSTANCE
  const res = await fetch(`https://${instance}/api/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `d=${tokens.xoxd}`,
    },
    body: form.toString(),
  })
  const data = await res.json().catch(() => ({} as Record<string, unknown>))
  if (!data || (data as { ok?: boolean }).ok !== true) {
    const err: SlackError = {
      ok: false,
      error: typeof (data as { error?: string }).error === "string"
        ? (data as { error: string }).error
        : `http_${res.status}`,
      status: res.status,
    }
    throw err
  }
  return data as T
}

export async function openUserDM(
  tokens: UserDMTokens,
  slackId: string
): Promise<OpenDMResult> {
  const form = new URLSearchParams()
  form.set("users", slackId)
  const data = await slackUserCall<{ channel: { id: string }; already_open?: boolean }>(
    tokens,
    "conversations.open",
    form
  )
  return { channelId: data.channel.id, alreadyOpen: data.already_open ?? false }
}

export async function closeUserDM(tokens: UserDMTokens, channelId: string): Promise<void> {
  const form = new URLSearchParams()
  form.set("channel", channelId)
  await slackUserCall(tokens, "conversations.close", form)
}

export interface SlackHistoryMessage {
  ts: string
  user?: string
  text?: string
  thread_ts?: string
  reply_count?: number
  subtype?: string
}

interface PaginatedHistory {
  messages?: SlackHistoryMessage[]
  has_more?: boolean
  response_metadata?: { next_cursor?: string }
}

/**
 * Pull all DM messages with ts >= oldestUnix, paginated, sorted ascending.
 * `oldestUnix` is a Slack-style unix timestamp string ("1747000000.000000"
 * is fine; so is "1747000000"). `inclusive=true` so the boundary message
 * is returned.
 */
export async function fetchUserDMHistorySince(
  tokens: UserDMTokens,
  channelId: string,
  oldestUnix: string,
): Promise<SlackHistoryMessage[]> {
  const all: SlackHistoryMessage[] = []
  let cursor: string | undefined
  while (true) {
    const form = new URLSearchParams()
    form.set("channel", channelId)
    form.set("limit", "200")
    form.set("oldest", oldestUnix)
    form.set("inclusive", "true")
    if (cursor) form.set("cursor", cursor)
    const data = await slackUserCall<PaginatedHistory>(tokens, "conversations.history", form)
    if (data.messages) all.push(...data.messages)
    if (!data.has_more || !data.response_metadata?.next_cursor) break
    cursor = data.response_metadata.next_cursor
  }
  return all.sort((a, b) => Number(a.ts) - Number(b.ts))
}

/** Pull replies in a thread; parent is excluded. Sorted ascending by ts. */
export async function fetchUserDMThreadReplies(
  tokens: UserDMTokens,
  channelId: string,
  threadTs: string,
): Promise<SlackHistoryMessage[]> {
  const all: SlackHistoryMessage[] = []
  let cursor: string | undefined
  while (true) {
    const form = new URLSearchParams()
    form.set("channel", channelId)
    form.set("ts", threadTs)
    form.set("limit", "200")
    if (cursor) form.set("cursor", cursor)
    const data = await slackUserCall<PaginatedHistory>(tokens, "conversations.replies", form)
    if (data.messages) all.push(...data.messages)
    if (!data.has_more || !data.response_metadata?.next_cursor) break
    cursor = data.response_metadata.next_cursor
  }
  return all.filter((m) => m.ts !== threadTs).sort((a, b) => Number(a.ts) - Number(b.ts))
}

export async function postUserMessage(
  tokens: UserDMTokens,
  channelId: string,
  text: string
): Promise<PostMessageResult> {
  const form = new URLSearchParams()
  form.set("channel", channelId)
  form.set("text", text)
  // mrkdwn rendering ON. Slack mrkdwn supports *bold*, _italic_, `code`,
  // > quote, <url|label>, and bullet lists with leading "•".
  form.set("mrkdwn", "true")
  const data = await slackUserCall<{ ts: string; channel: string }>(
    tokens,
    "chat.postMessage",
    form
  )
  return { ts: data.ts, channelId: data.channel }
}

/**
 * Send a single DM to a user. Opens a conversation and posts the message.
 * Leaves the conversation open afterward — recipients reply in their own
 * Slack client, and admins want the thread visible in their sidebar so
 * they can follow up.
 *
 * Throws a `SlackError` (`{ ok: false, error, status }`) on any Slack API
 * failure. Caller is responsible for surfacing.
 */
export async function sendUserDM(
  tokens: UserDMTokens,
  slackId: string,
  text: string
): Promise<{ ts: string; channelId: string; alreadyOpen: boolean }> {
  const { channelId, alreadyOpen } = await openUserDM(tokens, slackId)
  const { ts } = await postUserMessage(tokens, channelId, text)
  return { ts, channelId, alreadyOpen }
}

export function isSlackError(e: unknown): e is SlackError {
  return !!e && typeof e === "object" && "ok" in e && (e as { ok: unknown }).ok === false
}
