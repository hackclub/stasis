import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
})

const S3_BUCKET = process.env.S3_BUCKET_NAME

async function uploadToS3(file: File, folder: "images" | "videos"): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  
  const ext = file.name.split(".").pop() || (folder === "videos" ? "webm" : "jpg")
  const key = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
  
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    })
  )
  
  const publicBaseUrl = process.env.S3_PUBLIC_URL
  if (!publicBaseUrl) {
    throw new Error("S3_PUBLIC_URL not configured")
  }
  
  return `${publicBaseUrl.replace(/\/$/, "")}/${key}`
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
    
    if (!S3_BUCKET || !process.env.S3_ACCESS_KEY_ID) {
      return NextResponse.json({ error: "S3 not configured" }, { status: 500 })
    }
    
    const url = await uploadToS3(file, isVideo ? "videos" : "images")

    return NextResponse.json({ url })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
