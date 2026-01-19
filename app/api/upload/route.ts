import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const CDN_API_URL = "https://cdn.hackclub.com/api/v3/new"
const CDN_TOKEN = process.env.HACKCLUB_CDN_TOKEN

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
})

const S3_BUCKET = process.env.S3_BUCKET_NAME

async function uploadToS3(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  
  const ext = file.name.split(".").pop() || "webm"
  const key = `videos/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
  
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  )
  
  // Use S3_PUBLIC_URL for R2 public access (custom domain or r2.dev subdomain)
  const publicBaseUrl = process.env.S3_PUBLIC_URL
  if (!publicBaseUrl) {
    throw new Error("S3_PUBLIC_URL not configured")
  }
  
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`
}

async function uploadToCDN(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString("base64")
  const dataUrl = `data:${file.type};base64,${base64}`

  const cdnResponse = await fetch(CDN_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${CDN_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([dataUrl]),
  })

  if (!cdnResponse.ok) {
    const errorText = await cdnResponse.text()
    console.error("CDN upload failed:", errorText)
    throw new Error("Failed to upload to CDN")
  }

  const cdnData = await cdnResponse.json()
  const uploadedFile = cdnData.files?.[0]

  if (!uploadedFile?.deployedUrl) {
    throw new Error("CDN returned invalid response")
  }

  return uploadedFile.deployedUrl
}

// TODO: Add rate limiting - file uploads are resource-intensive
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    console.log("Upload request:", { name: file.name, type: file.type, size: file.size })

    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"]
    const allowedTypes = [...imageTypes, ...videoTypes]
    
    // Also allow empty type for blobs and check by extension
    const ext = file.name.split(".").pop()?.toLowerCase()
    const isVideoByExt = ["mp4", "webm", "mov", "mkv"].includes(ext || "")
    
    if (!allowedTypes.includes(file.type) && !isVideoByExt) {
      return NextResponse.json({ error: `Invalid file type: ${file.type}. Use JPEG, PNG, GIF, WebP, MP4, WebM, or MOV` }, { status: 400 })
    }

    const maxSize = 100 * 1024 * 1024 // 100MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large. Max 100MB" }, { status: 400 })
    }

    const isVideo = videoTypes.includes(file.type) || isVideoByExt
    let url: string

    if (isVideo) {
      // Upload videos to S3 (Cloudflare R2)
      if (!S3_BUCKET || !process.env.S3_ACCESS_KEY_ID) {
        return NextResponse.json({ error: "S3 not configured" }, { status: 500 })
      }
      url = await uploadToS3(file)
    } else {
      // Upload images to Hack Club CDN
      if (!CDN_TOKEN) {
        return NextResponse.json({ error: "CDN not configured" }, { status: 500 })
      }
      url = await uploadToCDN(file)
    }

    return NextResponse.json({ url })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
