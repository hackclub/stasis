'use client';

import { useState, useCallback } from 'react';

interface NFCScannerProps {
  mode: 'read' | 'write';
  writeData?: string;
  onRead: (slackUserId: string) => void;
  onWriteComplete?: () => void;
}

export function NFCScanner({ mode, writeData, onRead, onWriteComplete }: NFCScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [manualId, setManualId] = useState('');

  const supportsNFC = typeof window !== 'undefined' && 'NDEFReader' in window;

  const startScan = useCallback(async () => {
    if (!supportsNFC) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const NDEFReader = (window as any).NDEFReader;
      const reader = new NDEFReader();

      if (mode === 'read') {
        setScanning(true);
        setStatus('Scanning... Hold NFC tag near device.');
        await reader.scan();

        reader.addEventListener('reading', ({ message }: { message: { records: Array<{ recordType: string; data: ArrayBuffer }> } }) => {
          for (const record of message.records) {
            if (record.recordType === 'text') {
              const decoder = new TextDecoder();
              const value = decoder.decode(record.data);
              setScanning(false);
              setStatus('Tag read successfully.');
              onRead(value);
              return;
            }
          }
          setStatus('No text record found on tag.');
        });

        reader.addEventListener('readingerror', () => {
          setStatus('Error reading tag. Try again.');
        });
      } else if (mode === 'write' && writeData) {
        setScanning(true);
        setStatus('Hold NFC tag near device to write...');
        await reader.write({
          records: [{ recordType: 'text', data: writeData }],
        });
        setScanning(false);
        setStatus('Tag written successfully.');
        onWriteComplete?.();
      }
    } catch (err) {
      setScanning(false);
      setStatus(`NFC error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [mode, writeData, onRead, onWriteComplete, supportsNFC]);

  const stopScan = () => {
    setScanning(false);
    setStatus('');
  };

  // Fallback: manual entry
  if (!supportsNFC) {
    return (
      <div className="border-2 border-brown-800 bg-cream-100 p-4">
        <p className="text-brown-800/60 text-xs mb-2 uppercase tracking-wider">
          NFC not supported on this device
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={manualId}
            onChange={e => setManualId(e.target.value)}
            placeholder="Enter Slack User ID"
            className="flex-1 border-2 border-brown-800 bg-cream-50 text-brown-800 px-3 py-2 text-sm placeholder:text-brown-800/30"
          />
          <button
            onClick={() => {
              if (manualId.trim()) {
                onRead(manualId.trim());
                setManualId('');
              }
            }}
            disabled={!manualId.trim()}
            className="px-4 py-2 text-sm uppercase tracking-wider border-2 border-brown-800 text-brown-800 hover:bg-brown-800 hover:text-cream-50 disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Submit
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-brown-800 bg-cream-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-brown-800 text-sm uppercase tracking-wider">
          NFC {mode === 'read' ? 'Reader' : 'Writer'}
        </span>
        {scanning && (
          <span className="inline-block w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
        )}
      </div>

      {status && (
        <p className="text-brown-800/70 text-sm mb-3">{status}</p>
      )}

      <button
        onClick={scanning ? stopScan : startScan}
        className={`w-full py-2 text-sm uppercase tracking-wider border-2 border-brown-800 transition-colors cursor-pointer ${
          scanning
            ? 'bg-brown-800 text-cream-50 hover:bg-brown-900'
            : 'text-brown-800 hover:bg-brown-800 hover:text-cream-50'
        }`}
      >
        {scanning ? 'Stop Scan' : mode === 'read' ? 'Start Scan' : 'Write Tag'}
      </button>
    </div>
  );
}
