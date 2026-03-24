let tokenCache: { accessToken: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken
  }

  const clientId = process.env.DIGIKEY_CLIENT_ID
  const clientSecret = process.env.DIGIKEY_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error("DigiKey credentials not configured")
  }

  const res = await fetch("https://api.digikey.com/v1/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  })

  if (!res.ok) {
    throw new Error(`DigiKey token request failed: ${res.status}`)
  }

  const data = await res.json()
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return tokenCache.accessToken
}

export async function searchDigiKey(
  query: string
): Promise<{ name: string; imageUrl: string }[]> {
  const token = await getToken()

  const res = await fetch(
    "https://api.digikey.com/products/v4/search/keyword",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-DIGIKEY-Client-Id": process.env.DIGIKEY_CLIENT_ID!,
      },
      body: JSON.stringify({
        Keywords: query,
        RecordCount: 10,
      }),
    }
  )

  if (!res.ok) {
    throw new Error(`DigiKey search failed: ${res.status}`)
  }

  const data = await res.json()
  const products = data.Products ?? data.products ?? []

  return products
    .filter(
      (p: { PrimaryPhoto?: string; ProductDescription?: string }) =>
        p.PrimaryPhoto
    )
    .map(
      (p: { PrimaryPhoto: string; ProductDescription?: string; ManufacturerPartNumber?: string }) => ({
        name:
          p.ProductDescription ?? p.ManufacturerPartNumber ?? "Unknown",
        imageUrl: p.PrimaryPhoto,
      })
    )
}
