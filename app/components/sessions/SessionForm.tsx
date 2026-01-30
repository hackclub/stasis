'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { calculateJournalXP } from '@/lib/xp';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });

export type SessionCategory =
    | "FIRMWARE"
    | "DESIGN_PLANNING"
    | "PHYSICAL_BUILDING"
    | "SCHEMATIC"
    | "PCB_DESIGN"
    | "CADING"

export interface MediaItem {
    id?: string
    type: "IMAGE" | "VIDEO"
    url: string
    file?: File
    uploading?: boolean
}

const CATEGORIES: { value: SessionCategory; label: string }[] = [
    { value: "FIRMWARE", label: "Firmware" },
    { value: "DESIGN_PLANNING", label: "Design / Planning" },
    { value: "PHYSICAL_BUILDING", label: "Physical Building" },
    { value: "SCHEMATIC", label: "Schematic" },
    { value: "PCB_DESIGN", label: "PCB Design" },
    { value: "CADING", label: "CADing" },
]

export interface SessionFormData {
    hoursValue: number
    minutesValue: number
    content: string
    categories: SessionCategory[]
    media: MediaItem[]
}

export interface XPPreviewData {
    dayStreak: number
    weekStreak: number
}

interface SessionFormProps {
    initialData?: SessionFormData
    onSubmit: (data: { hoursClaimed: number; content: string; categories: SessionCategory[]; media: { type: "IMAGE" | "VIDEO"; url: string }[] }) => Promise<void>
    submitLabel: string
    submitting: boolean
    error: string | null
    setError: (error: string | null) => void
    children?: React.ReactNode
    autosaveKey?: string // Unique key for localStorage autosave (e.g., "session-new-{projectId}" or "session-edit-{sessionId}")
    xpPreviewData?: XPPreviewData // Current streak data for XP preview
}

export function SessionForm({
    initialData,
    onSubmit,
    submitLabel,
    submitting,
    error,
    setError,
    children,
    autosaveKey,
    xpPreviewData
}: Readonly<SessionFormProps>) {
    const [hoursValue, setHoursValue] = useState(initialData?.hoursValue ?? 0);
    const [minutesValue, setMinutesValue] = useState(initialData?.minutesValue ?? 0);
    const [content, setContent] = useState(initialData?.content ?? '');
    const [selectedCategories, setSelectedCategories] = useState<SessionCategory[]>(initialData?.categories ?? []);
    const [media, setMedia] = useState<MediaItem[]>(initialData?.media ?? []);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
    const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
    const videoPreviewRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

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
        const placeholderUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        const placeholder = `\n![Uploading ${file.name}...](${placeholderUrl})\n`;
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
    }, [setError]);

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
        if ((isRecording || showDeviceSelector) && videoPreviewRef.current && streamRef.current) {
            videoPreviewRef.current.srcObject = streamRef.current;
            videoPreviewRef.current.play().catch(() => { });
        }
    }, [isRecording, showDeviceSelector]);

    // Restore draft from localStorage on mount
    useEffect(() => {
        if (!autosaveKey || hasRestoredDraft) return;

        try {
            const saved = localStorage.getItem(`stasis-draft-${autosaveKey}`);
            if (saved) {
                const draft = JSON.parse(saved);
                // Only restore if there's actual content and no initial data was provided
                if (draft.content && !initialData?.content) {
                    setContent(draft.content);
                    if (draft.hoursValue !== undefined) setHoursValue(draft.hoursValue);
                    if (draft.minutesValue !== undefined) setMinutesValue(draft.minutesValue);
                    if (draft.categories) setSelectedCategories(draft.categories);
                    setLastSaved(new Date(draft.savedAt));
                }
            }
        } catch {
            // Ignore parse errors
        }
        setHasRestoredDraft(true);
    }, [autosaveKey, hasRestoredDraft, initialData?.content]);

    // Track if we should skip the next autosave (to prevent overwriting restored draft)
    const skipNextAutosave = useRef(true);

    // Autosave to localStorage with debounce
    useEffect(() => {
        if (!autosaveKey || !hasRestoredDraft) return;

        // Skip the first autosave after restoration to prevent overwriting
        if (skipNextAutosave.current) {
            skipNextAutosave.current = false;
            return;
        }

        // Only save if there's actual content to save
        if (!content.trim() && hoursValue === 0 && minutesValue === 0) return;

        const timeoutId = setTimeout(() => {
            const draft = {
                content,
                hoursValue,
                minutesValue,
                categories: selectedCategories,
                savedAt: new Date().toISOString(),
            };
            try {
                localStorage.setItem(`stasis-draft-${autosaveKey}`, JSON.stringify(draft));
                setLastSaved(new Date());
            } catch {
                // Ignore storage errors
            }
        }, 1000); // 1 second debounce

        return () => clearTimeout(timeoutId);
    }, [autosaveKey, content, hoursValue, minutesValue, selectedCategories, hasRestoredDraft]);

    // Clear draft on successful submit
    const clearDraft = useCallback(() => {
        if (autosaveKey) {
            try {
                localStorage.removeItem(`stasis-draft-${autosaveKey}`);
            } catch {
                // Ignore
            }
        }
    }, [autosaveKey]);

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

    const hoursNum = hoursValue + minutesValue / 60;
    const requiredVideos = Math.floor(hoursNum / 4);
    const imageCount = media.filter(m => m.type === "IMAGE").length;
    const videoCount = media.filter(m => m.type === "VIDEO").length;

    const xpPreview = useMemo(() => {
        if (!xpPreviewData || hoursNum <= 0) return null;
        const nextDayStreak = xpPreviewData.dayStreak + 1;
        const nextWeekStreak = xpPreviewData.weekStreak;
        return calculateJournalXP(nextDayStreak, nextWeekStreak, hoursNum);
    }, [xpPreviewData, hoursNum]);

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
    }, [selectedVideoDevice, selectedAudioDevice, setError]);

    const closeDeviceSelector = useCallback(() => {
        if (streamRef.current && !isRecording) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setShowDeviceSelector(false);
    }, [isRecording]);

    const startRecording = useCallback(async () => {
        try {
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
                    const mimeType = recorder.mimeType || 'video/webm';
                    const blob = new Blob(chunks, { type: mimeType });
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
                    } catch {
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
            recorder.start(100);
            setRecordingStartTime(Date.now());
            setIsRecording(true);
        } catch (err) {
            console.error('Failed to start recording:', err);
            const errorMessage = err instanceof Error ? err.message : 'Unknown error';
            setError(`Failed to access camera/microphone: ${errorMessage}. Please check permissions.`);
        }
    }, [selectedVideoDevice, selectedAudioDevice, setError]);

    const stopRecording = useCallback(() => {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.requestData();
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

        if (hoursNum <= 0) {
            setError('Please enter a time greater than 0');
            return;
        }

        if (hoursNum > 24) {
            setError('Session cannot exceed 24 hours');
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

        const stillUploading = media.some(m => m.uploading);
        if (stillUploading) {
            setError('Please wait for all files to finish uploading');
            return;
        }

        const mediaWithUrls = media.map(m => ({
            type: m.type,
            url: m.url,
        }));

        await onSubmit({
            hoursClaimed: hoursNum,
            content: content.trim(),
            categories: selectedCategories,
            media: mediaWithUrls,
        });

        clearDraft();
    };

    return (
        <>
            {/* Journal Entry Guidelines */}
            <div className="mb-6 bg-cream-900 border-2 border-cream-600 p-4">
                <h2 className="text-brand-400 text-sm uppercase tracking-wide mb-3">Journal Entry Guidelines</h2>
                <ul className="list-disc list-inside text-cream-300 text-sm space-y-1">
                    <li>Try to keep each entry under 5 hours</li>
                    <li>Include your thoughts, failures, and rabbit holes—not just final steps</li>
                    <li>Be detailed and thorough with your journal entries.</li>
                    <li>100-200~ words is recommended</li>
                    <li><strong className="text-cream-100">Images are required</strong> for every journal entry</li>
                    <li><strong className="text-cream-100">Sessions over 7 hours require a timelapse</strong></li>
                </ul>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Hours & Minutes */}
                <div className="bg-cream-900 border-2 border-cream-600 p-4">
                    <label className="block text-cream-300 text-sm uppercase mb-3">
                        Time Spent This Session
                    </label>
                    <div className="flex items-center gap-1.5">
                        {/* Hours */}
                        <div className="flex border-2 border-cream-600 bg-cream-950">
                            <div className="flex flex-col items-center justify-center px-4 py-1.5">
                                <span className="text-xl text-cream-100 font-bold tabular-nums leading-tight">
                                    {hoursValue}
                                </span>
                                <span className="text-cream-500 text-[10px] uppercase tracking-wider">hrs</span>
                            </div>
                            <div className="flex flex-col border-l-2 border-cream-600">
                                <button
                                    type="button"
                                    onClick={() => setHoursValue(Math.min(24, hoursValue + 1))}
                                    className="w-8 h-6 bg-cream-850 hover:bg-cream-700 active:bg-cream-600 text-cream-100 text-base font-bold transition-colors cursor-pointer border-b border-cream-600 flex items-center justify-center select-none"
                                >
                                    +
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHoursValue(Math.max(0, hoursValue - 1))}
                                    className="w-8 h-6 bg-cream-850 hover:bg-cream-700 active:bg-cream-600 text-cream-100 text-base font-bold transition-colors cursor-pointer flex items-center justify-center select-none"
                                >
                                    −
                                </button>
                            </div>
                        </div>

                        <span className="text-cream-500 text-xl">:</span>

                        {/* Minutes */}
                        <div className="flex border-2 border-cream-600 bg-cream-950">
                            <div className="flex flex-col items-center justify-center px-4 py-1.5">
                                <span className="text-xl text-cream-100 font-bold tabular-nums leading-tight">
                                    {String(minutesValue).padStart(2, '0')}
                                </span>
                                <span className="text-cream-500 text-[10px] uppercase tracking-wider">min</span>
                            </div>
                            <div className="flex flex-col border-l-2 border-cream-600">
                                <button
                                    type="button"
                                    onClick={() => setMinutesValue(minutesValue === 45 ? 0 : minutesValue + 15)}
                                    className="w-8 h-6 bg-cream-850 hover:bg-cream-700 active:bg-cream-600 text-cream-100 text-base font-bold transition-colors cursor-pointer border-b border-cream-600 flex items-center justify-center select-none"
                                >
                                    +
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMinutesValue(minutesValue === 0 ? 45 : minutesValue - 15)}
                                    className="w-8 h-6 bg-cream-850 hover:bg-cream-700 active:bg-cream-600 text-cream-100 text-base font-bold transition-colors cursor-pointer flex items-center justify-center select-none"
                                >
                                    −
                                </button>
                            </div>
                        </div>
                    </div>

                    {hoursNum === 0 && (
                        <p className="text-red-500 text-sm mt-4">
                            Please enter a time greater than 0
                        </p>
                    )}
                    {hoursNum > 4 && (
                        <p className="text-brand-500 text-sm mt-4">
                            ⚠ Sessions over 4 hours require {requiredVideos} video clip{requiredVideos > 1 ? 's' : ''} (10-30 seconds each)
                        </p>
                    )}

                    {xpPreview && (
                        <div className="mt-4 pt-4 border-t border-cream-700">
                            <div className="flex items-center gap-3">
                                <span className="text-cream-400 text-sm uppercase">XP if approved:</span>
                                <span className="text-brand-400 font-bold text-lg">+{xpPreview.xp} XP</span>
                                {xpPreview.multiplier > 1 && (
                                    <span className="text-cream-500 text-sm">({xpPreview.multiplier}x multiplier)</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Categories */}
                <div className="bg-cream-100 border-2 border-cream-400 p-4">
                    <label className="block text-cream-700 text-sm uppercase mb-3">
                        Categories (select all that apply)
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map((cat) => (
                            <button
                                key={cat.value}
                                type="button"
                                onClick={() => handleCategoryToggle(cat.value)}
                                className={`px-4 py-2 text-sm uppercase transition-colors cursor-pointer ${selectedCategories.includes(cat.value)
                                        ? 'bg-brand-500 text-white font-medium'
                                        : 'bg-cream-300 text-cream-700 hover:bg-cream-400'
                                    }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Journal Content */}
                <div className="bg-cream-100 border-2 border-cream-400 p-4">
                    <label className="block text-cream-700 text-sm uppercase mb-2">
                        What Did You Work On?
                    </label>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-cream-600 text-xs">
                            Write in Markdown. <span className="text-cream-700">At least 2 images required</span> — drag, drop, or paste directly into the editor.
                            {uploadingToEditor && <span className="text-brand-500 ml-2">Uploading image...</span>}
                        </p>
                        {autosaveKey && lastSaved && (
                            <span className="text-cream-500 text-xs">
                                Draft saved {lastSaved.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
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
                    <div className="bg-cream-100 border-2 border-cream-400 p-4">
                        <label className="block text-cream-700 text-sm uppercase mb-2">
                            Video Clips <span className="text-red-500">*</span>
                        </label>
                        <p className="text-cream-600 text-xs mb-3">
                            Record a 10-30 second video explaining what you did.
                            You need {requiredVideos} video{requiredVideos > 1 ? 's' : ''} for this session length. Max 100MB per file.
                        </p>

                        <div className="flex flex-wrap gap-3 mb-3">
                            {media.filter(m => m.type === "VIDEO").map((item, index) => {
                                const actualIndex = media.findIndex(m => m === item);
                                const isBlobUrl = item.url.startsWith('blob:');
                                return (
                                    <div key={index} className="relative w-32 h-24 bg-cream-200 border border-cream-400">
                                        <video
                                            src={isBlobUrl ? item.url : `${item.url}#t=0.1`}
                                            preload="metadata"
                                            className="w-full h-full object-cover"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeMedia(actualIndex)}
                                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white flex items-center justify-center cursor-pointer"
                                        >
                                            ×
                                        </button>
                                        <div className="absolute bottom-1 left-1 bg-cream-200/80 px-1 text-xs text-cream-700">
                                            {item.uploading ? 'Uploading...' : 'Video'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Device Selector with Preview */}
                        {showDeviceSelector && !isRecording && (
                            <div className="mb-4 p-3 bg-cream-200 border border-cream-400">
                                <div className="relative w-64 h-48 bg-cream-300 border border-cream-400 mb-3">
                                    <video
                                        ref={videoPreviewRef}
                                        autoPlay
                                        muted
                                        playsInline
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute top-2 left-2 bg-cream-200/80 px-2 py-1">
                                        <span className="text-cream-700 text-xs uppercase">Preview</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-3">
                                    <div>
                                        <label className="block text-cream-700 text-xs uppercase mb-1">Camera</label>
                                        <select
                                            value={selectedVideoDevice}
                                            onChange={(e) => setSelectedVideoDevice(e.target.value)}
                                            className="w-full bg-cream-100 border border-cream-400 text-cream-800 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                                        >
                                            {videoDevices.map((device) => (
                                                <option key={device.deviceId} value={device.deviceId}>
                                                    {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-cream-700 text-xs uppercase mb-1">Microphone</label>
                                        <select
                                            value={selectedAudioDevice}
                                            onChange={(e) => setSelectedAudioDevice(e.target.value)}
                                            className="w-full bg-cream-100 border border-cream-400 text-cream-800 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
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
                                        className="bg-cream-400 hover:bg-cream-500 text-cream-800 px-4 py-2 text-sm uppercase cursor-pointer transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Recording UI */}
                        {isRecording ? (
                            <div className="mb-4">
                                <div className="relative w-64 h-48 bg-cream-200 border-2 border-red-500 mb-3">
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
                                    <div className="absolute top-2 right-2 bg-cream-200/80 px-2 py-1">
                                        <span className="text-cream-800 text-sm font-mono">{formatDuration(recordingDuration)}</span>
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
                                        className="bg-cream-400 hover:bg-cream-500 text-cream-800 px-4 py-2 text-sm uppercase cursor-pointer transition-colors"
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
                                <label className="inline-block bg-cream-300 hover:bg-cream-400 text-cream-800 px-4 py-2 text-sm uppercase cursor-pointer transition-colors">
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

                {error && (
                    <div className="bg-red-600/20 border-2 border-red-600/50 p-4">
                        <p className="text-red-500">{error}</p>
                    </div>
                )}

                {/* Submit */}
                <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-brand-500 hover:bg-brand-400 disabled:bg-cream-400 disabled:text-cream-600 disabled:cursor-not-allowed text-white font-medium py-4 text-lg uppercase tracking-wider transition-colors cursor-pointer"
                >
                    {submitting ? 'Saving...' : submitLabel}
                </button>
            </form>

            {children}
        </>
    );
}
