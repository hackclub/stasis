'use client';

import React, { useState, useEffect, use, useRef, useCallback } from 'react';
import { useSession } from "@/lib/auth-client";
import { useRouter } from 'next/navigation';
import { NoiseOverlay } from '@/app/components/NoiseOverlay';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

type SessionCategory = 
  | "FIRMWARE"
  | "DESIGN_PLANNING"
  | "PHYSICAL_BUILDING"
  | "SCHEMATIC"
  | "PCB_DESIGN"
  | "CADING"

interface MediaItem {
  type: "IMAGE" | "VIDEO"
  url: string
  file?: File
  uploading?: boolean
}

type ProjectStatus = "draft" | "in_review" | "approved" | "rejected" | "update_requested"

interface Project {
  id: string
  title: string
  githubRepo: string | null
  designStatus: ProjectStatus
  buildStatus: ProjectStatus
}

const CATEGORIES: { value: SessionCategory; label: string }[] = [
  { value: "FIRMWARE", label: "Firmware" },
  { value: "DESIGN_PLANNING", label: "Design / Planning" },
  { value: "PHYSICAL_BUILDING", label: "Physical Building" },
  { value: "SCHEMATIC", label: "Schematic" },
  { value: "PCB_DESIGN", label: "PCB Design" },
  { value: "CADING", label: "CADing" },
]

export default function NewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const { data: session, isPending } = useSession();
  const router = useRouter();
  
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [hours, setHours] = useState<string>('');
  const [content, setContent] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<SessionCategory[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const videoPreviewRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [uploadingToEditor, setUploadingToEditor] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const uploadImageToEditor = useCallback(async (file: File) => {
    const imageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!imageTypes.includes(file.type)) {
      setError("Only images (JPEG, PNG, GIF, WebP) can be embedded in the editor");
      return;
    }

    setUploadingToEditor(true);
    const placeholder = `\n![Uploading ${file.name}...]()\n`;
    setContent(prev => prev + placeholder);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        const { url } = await res.json();
        const markdown = `![${file.name.replace(/\.[^.]+$/, '')}](${url})`;
        setContent(prev => prev.replace(placeholder, `\n${markdown}\n`));
        
        // Also add to media array so it counts toward the image requirement
        setMedia(prev => [...prev, { type: "IMAGE", url, uploading: false }]);
      } else {
        const data = await res.json();
        setContent(prev => prev.replace(placeholder, ''));
        setError(data.error || 'Failed to upload image');
      }
    } catch {
      setContent(prev => prev.replace(placeholder, ''));
      setError('Failed to upload image');
    } finally {
      setUploadingToEditor(false);
    }
  }, []);

  const handleEditorDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        uploadImageToEditor(file);
      }
    });
  }, [uploadImageToEditor]);

  const handleEditorPaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          uploadImageToEditor(file);
        }
        break;
      }
    }
  }, [uploadImageToEditor]);

  useEffect(() => {
    async function fetchProject() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
        } else if (res.status === 404) {
          router.push('/dashboard');
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
      } finally {
        setLoading(false);
      }
    }

    if (session) {
      fetchProject();
    } else if (!isPending) {
      router.push('/dashboard');
    }
  }, [session, isPending, projectId, router]);

  // Attach stream to video element when recording starts or device selector opens
  useEffect(() => {
    if ((isRecording || showDeviceSelector) && videoPreviewRef.current && streamRef.current) {
      videoPreviewRef.current.srcObject = streamRef.current;
      videoPreviewRef.current.play().catch(() => {});
    }
  }, [isRecording, showDeviceSelector]);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isRecording && recordingStartTime) {
      interval = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - recordingStartTime) / 1000));
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, recordingStartTime]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hoursNum = parseFloat(hours) || 0;
  const requiredVideos = Math.floor(hoursNum / 4);
  const imageCount = media.filter(m => m.type === "IMAGE").length;
  const videoCount = media.filter(m => m.type === "VIDEO").length;

  const handleCategoryToggle = (cat: SessionCategory) => {
    setSelectedCategories(prev =>
      prev.includes(cat)
        ? prev.filter(c => c !== cat)
        : [...prev, cat]
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "IMAGE" | "VIDEO") => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const tempUrl = URL.createObjectURL(file);
      setMedia(prev => [...prev, { type, url: tempUrl, file, uploading: true }]);
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (res.ok) {
          const { url } = await res.json();
          setMedia(prev => prev.map(m => 
            m.url === tempUrl ? { ...m, url, uploading: false } : m
          ));
          URL.revokeObjectURL(tempUrl);
        } else {
          setMedia(prev => prev.filter(m => m.url !== tempUrl));
          URL.revokeObjectURL(tempUrl);
          const data = await res.json();
          setError(data.error || 'Failed to upload file');
        }
      } catch {
        setMedia(prev => prev.filter(m => m.url !== tempUrl));
        URL.revokeObjectURL(tempUrl);
        setError('Failed to upload file');
      }
    }
    
    e.target.value = '';
  };

  const removeMedia = (index: number) => {
    setMedia(prev => {
      const item = prev[index];
      if (item.url.startsWith('blob:')) {
        URL.revokeObjectURL(item.url);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const enumerateDevices = useCallback(async () => {
    try {
      // Request permission and keep stream for preview
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      
      setVideoDevices(videoInputs);
      setAudioDevices(audioInputs);
      
      if (videoInputs.length > 0 && !selectedVideoDevice) {
        setSelectedVideoDevice(videoInputs[0].deviceId);
      }
      if (audioInputs.length > 0 && !selectedAudioDevice) {
        setSelectedAudioDevice(audioInputs[0].deviceId);
      }
      
      setShowDeviceSelector(true);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      setError('Failed to access camera/microphone. Please ensure you have granted permissions.');
    }
  }, [selectedVideoDevice, selectedAudioDevice]);

  const closeDeviceSelector = useCallback(() => {
    if (streamRef.current && !isRecording) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowDeviceSelector(false);
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    try {
      // Stop existing preview stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const constraints: MediaStreamConstraints = {
        video: selectedVideoDevice 
          ? { deviceId: { exact: selectedVideoDevice } } 
          : { facingMode: 'user' },
        audio: selectedAudioDevice 
          ? { deviceId: { exact: selectedAudioDevice } } 
          : true,
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      // Find supported mimeType
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }
      
      const recorderOptions: MediaRecorderOptions = selectedMimeType 
        ? { mimeType: selectedMimeType } 
        : {};
      
      const recorder = new MediaRecorder(stream, recorderOptions);
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        try {
          console.log('onstop fired, chunks:', chunks.length);
          const mimeType = recorder.mimeType || 'video/webm';
          const blob = new Blob(chunks, { type: mimeType });
          console.log('Blob created, size:', blob.size);
          const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
          
          if (blob.size === 0) {
            setError('Recording failed - no data captured. Please try again.');
            stream.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setShowDeviceSelector(false);
            setIsRecording(false);
            setMediaRecorder(null);
            setRecordingStartTime(null);
            return;
          }
          
          const tempUrl = URL.createObjectURL(blob);
          console.log('Adding video to media state');
          
          setMedia(prev => [...prev, { type: "VIDEO", url: tempUrl, uploading: true }]);
          
          const formData = new FormData();
          formData.append('file', blob, `recording.${extension}`);
          
          try {
            const res = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            });
            
            if (res.ok) {
              const { url } = await res.json();
              setMedia(prev => prev.map(m => 
                m.url === tempUrl ? { ...m, url, uploading: false } : m
              ));
              URL.revokeObjectURL(tempUrl);
            } else {
              setMedia(prev => prev.filter(m => m.url !== tempUrl));
              URL.revokeObjectURL(tempUrl);
              const data = await res.json();
              setError(data.error || 'Failed to upload recording');
            }
          } catch (uploadErr) {
            console.error('Upload error:', uploadErr);
            setMedia(prev => prev.filter(m => m.url !== tempUrl));
            URL.revokeObjectURL(tempUrl);
            setError('Failed to upload recording');
          }
          
          stream.getTracks().forEach(track => track.stop());
          streamRef.current = null;
          setRecordedChunks([]);
          setShowDeviceSelector(false);
          setIsRecording(false);
          setMediaRecorder(null);
          setRecordingStartTime(null);
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = null;
          }
        } catch (err) {
          console.error('onstop error:', err);
          setError('Recording processing failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
          setIsRecording(false);
          setMediaRecorder(null);
        }
      };
      
      setMediaRecorder(recorder);
      setRecordedChunks(chunks);
      recorder.start(100); // Collect data every 100ms
      setRecordingStartTime(Date.now());
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to access camera/microphone: ${errorMessage}. Please check permissions.`);
    }
  }, [selectedVideoDevice, selectedAudioDevice]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log('Stopping recording, state:', mediaRecorder.state);
      // Request any pending data before stopping
      mediaRecorder.requestData();
      // Small delay to allow final data chunk to be processed
      setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
      }, 100);
    }
  }, [mediaRecorder]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsRecording(false);
    setMediaRecorder(null);
    setRecordedChunks([]);
    
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
  }, [mediaRecorder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (hoursNum <= 0 || hoursNum > 24) {
      setError('Hours must be between 0 and 24');
      return;
    }

    if (!content.trim()) {
      setError('Journal content is required');
      return;
    }

    if (selectedCategories.length === 0) {
      setError('Select at least one category');
      return;
    }

    if (imageCount < 2) {
      setError('At least 2 images are required — drag, drop, or paste images into the editor');
      return;
    }

    if (requiredVideos > 0 && videoCount < requiredVideos) {
      setError(`Sessions over 4 hours require video clips. You need ${requiredVideos} video(s).`);
      return;
    }

    setSubmitting(true);

    try {
      const stillUploading = media.some(m => m.uploading);
      if (stillUploading) {
        setError('Please wait for all files to finish uploading');
        setSubmitting(false);
        return;
      }

      const mediaWithUrls = media.map(m => ({
        type: m.type,
        url: m.url,
      }));

      // Determine stage based on design status
      const stage = project?.designStatus === "approved" ? "BUILD" : "DESIGN";

      const res = await fetch(`/api/projects/${projectId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoursClaimed: hoursNum,
          content: content.trim(),
          categories: selectedCategories,
          media: mediaWithUrls,
          stage,
        }),
      });

      if (res.ok) {
        router.push(`/dashboard/projects/${projectId}`);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create session');
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      setError('Failed to create session');
    } finally {
      setSubmitting(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream-950 font-mono">
        <p className="text-cream-300">Loading...</p>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <>
      <div className="min-h-screen bg-cream-950 font-mono">
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-cream-800">
          <Link href="/dashboard" className="text-cream-300 hover:text-brand-500 transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            Back to Dashboard
          </Link>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="mb-6">
            <h1 className="text-brand-500 text-2xl uppercase tracking-wide">New Journal Entry</h1>
            <p className="text-cream-300 text-sm mt-1">Project: {project.title}</p>
            <div className="mt-3">
              <span className={`px-3 py-1 text-sm uppercase ${
                project.designStatus === "approved" 
                  ? 'bg-blue-600/30 border border-blue-600 text-blue-400' 
                  : 'bg-purple-600/30 border border-purple-600 text-purple-400'
              }`}>
                {project.designStatus === "approved" ? 'Build Stage Session' : 'Design Stage Session'}
              </span>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-600/20 border-2 border-red-600/50 p-4">
              <p className="text-red-500">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Hours */}
            <div className="bg-cream-900 border-2 border-cream-600 p-4">
              <label className="block text-cream-300 text-sm uppercase mb-2">
                Hours Spent This Session
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full bg-cream-950 border-2 border-cream-600 text-cream-100 px-3 py-2 text-2xl focus:border-brand-500 focus:outline-none transition-colors"
                placeholder="0"
                required
              />
              {hoursNum > 4 && (
                <p className="text-brand-500 text-sm mt-2">
                  ⚠ Sessions over 4 hours require {requiredVideos} video clip{requiredVideos > 1 ? 's' : ''} (10-30 seconds each)
                </p>
              )}
            </div>

            {/* Categories */}
            <div className="bg-cream-900 border-2 border-cream-600 p-4">
              <label className="block text-cream-300 text-sm uppercase mb-3">
                Categories (select all that apply)
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => handleCategoryToggle(cat.value)}
                    className={`px-4 py-2 text-sm uppercase transition-colors cursor-pointer ${
                      selectedCategories.includes(cat.value)
                        ? 'bg-brand-500 text-white font-medium'
                        : 'bg-cream-850 text-cream-300 hover:bg-cream-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Journal Content */}
            <div className="bg-cream-900 border-2 border-cream-600 p-4">
              <label className="block text-cream-300 text-sm uppercase mb-2">
                What Did You Work On?
              </label>
              <p className="text-cream-300 text-xs mb-3">
                Write in Markdown. <span className="text-cream-300">At least 2 images required</span> — drag, drop, or paste directly into the editor.
                {uploadingToEditor && <span className="text-brand-400 ml-2">Uploading image...</span>}
              </p>
              <div 
                ref={editorRef}
                data-color-mode="dark" 
                className="wmde-markdown-var"
                onDrop={handleEditorDrop}
                onDragOver={(e) => e.preventDefault()}
                onPaste={handleEditorPaste}
              >
                <MDEditor
                  value={content}
                  onChange={(val) => setContent(val || '')}
                  height={400}
                  preview="live"
                  textareaProps={{
                    placeholder: "Describe what you did in this session...",
                  }}
                />
              </div>
              {imageCount < 2 && (
                <p className="text-red-500 text-xs mt-2">
                  {imageCount === 0 
                    ? "At least 2 images required — drag, drop, or paste images into the editor above"
                    : `${imageCount}/2 images added — add ${2 - imageCount} more`}
                </p>
              )}
            </div>

            {/* Videos (conditional) */}
            {requiredVideos > 0 && (
              <div className="bg-cream-900 border-2 border-cream-600 p-4">
                <label className="block text-cream-300 text-sm uppercase mb-2">
                  Video Clips <span className="text-red-500">*</span>
                </label>
                <p className="text-cream-300 text-xs mb-3">
                  Record a 10-30 second video explaining what you did. 
                  You need {requiredVideos} video{requiredVideos > 1 ? 's' : ''} for this session length. Max 100MB per file.
                </p>
                
                <div className="flex flex-wrap gap-3 mb-3">
                  {media.filter(m => m.type === "VIDEO").map((item, index) => {
                    const actualIndex = media.findIndex(m => m === item);
                    return (
                      <div key={index} className="relative w-32 h-24 bg-cream-950 border border-cream-800">
                        <video src={item.url} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeMedia(actualIndex)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white flex items-center justify-center cursor-pointer"
                        >
                          ×
                        </button>
                        <div className="absolute bottom-1 left-1 bg-cream-950/80 px-1 text-xs text-cream-300">
                          Video
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Device Selector with Preview */}
                {showDeviceSelector && !isRecording && (
                  <div className="mb-4 p-3 bg-cream-950 border border-cream-700">
                    {/* Camera Preview */}
                    <div className="relative w-64 h-48 bg-cream-900 border border-cream-600 mb-3">
                      <video 
                        ref={videoPreviewRef} 
                        autoPlay 
                        muted 
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 bg-cream-950/80 px-2 py-1">
                        <span className="text-cream-200 text-xs uppercase">Preview</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-cream-300 text-xs uppercase mb-1">Camera</label>
                        <select
                          value={selectedVideoDevice}
                          onChange={(e) => setSelectedVideoDevice(e.target.value)}
                          className="w-full bg-cream-900 border border-cream-600 text-cream-100 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                        >
                          {videoDevices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-cream-300 text-xs uppercase mb-1">Microphone</label>
                        <select
                          value={selectedAudioDevice}
                          onChange={(e) => setSelectedAudioDevice(e.target.value)}
                          className="w-full bg-cream-900 border border-cream-600 text-cream-100 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                        >
                          {audioDevices.map((device) => (
                            <option key={device.deviceId} value={device.deviceId}>
                              {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={startRecording}
                        className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 text-sm uppercase cursor-pointer transition-colors flex items-center gap-2"
                      >
                        <span className="w-2 h-2 bg-white rounded-full" />
                        Start Recording
                      </button>
                      <button
                        type="button"
                        onClick={closeDeviceSelector}
                        className="bg-cream-700 hover:bg-cream-600 text-cream-100 px-4 py-2 text-sm uppercase cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Recording UI */}
                {isRecording ? (
                  <div className="mb-4">
                    <div className="relative w-64 h-48 bg-cream-950 border-2 border-red-500 mb-3">
                      <video 
                        ref={videoPreviewRef} 
                        autoPlay 
                        muted 
                        playsInline
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 flex items-center gap-2">
                        <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-red-500 text-xs uppercase font-medium">Recording</span>
                      </div>
                      <div className="absolute top-2 right-2 bg-cream-950/80 px-2 py-1">
                        <span className="text-white text-sm font-mono">{formatDuration(recordingDuration)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 text-sm uppercase cursor-pointer transition-colors"
                      >
                        ✓ Save Recording
                      </button>
                      <button
                        type="button"
                        onClick={cancelRecording}
                        className="bg-cream-700 hover:bg-cream-600 text-cream-100 px-4 py-2 text-sm uppercase cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : !showDeviceSelector && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={enumerateDevices}
                      className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 text-sm uppercase cursor-pointer transition-colors flex items-center gap-2"
                    >
                      <span className="w-2 h-2 bg-white rounded-full" />
                      Record with Webcam
                    </button>
                    <label className="inline-block bg-cream-850 hover:bg-cream-800 text-cream-100 px-4 py-2 text-sm uppercase cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="video/*"
                        multiple
                        onChange={(e) => handleFileUpload(e, "VIDEO")}
                        className="hidden"
                      />
                      + Upload Video
                    </label>
                  </div>
                )}
                
                {videoCount < requiredVideos && !isRecording && (
                  <p className="text-red-500 text-xs mt-2">
                    {videoCount}/{requiredVideos} videos uploaded
                  </p>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-500 hover:bg-brand-400 disabled:bg-cream-700 disabled:text-cream-300 disabled:cursor-not-allowed text-white font-medium py-4 text-lg uppercase tracking-wider transition-colors cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Save Journal Entry'}
            </button>
          </form>
        </div>
      </div>
      <NoiseOverlay />
    </>
  );
}
