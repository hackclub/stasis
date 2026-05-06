'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PlatformNoiseOverlay } from '../components/PlatformNoiseOverlay';
import { MagneticCorners } from '../components/MagneticCorners';
import { DottedLine } from '../components/DottedLine';
import { HoverScramble } from '../components/HoverScramble';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LogEntry {
  timestamp: string;
  direction: 'tx' | 'rx' | 'info' | 'error';
  message: string;
}

interface BatteryStatus {
  powerGood: boolean;
  charging: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAUD_RATE = 115200;
const RP2350_VENDOR_ID = 0x2e8a;
const READ_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ts(): string {
  const d = new Date();
  return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BadgeConfiguratorPage() {
  // -- WebSerial support detection --
  const [serialSupported, setSerialSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSerialSupported(typeof navigator !== 'undefined' && 'serial' in navigator);
  }, []);

  // -- Connection state --
  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const readableStreamClosedRef = useRef<Promise<void> | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [deviceVersion, setDeviceVersion] = useState<string | null>(null);

  // -- Form state --
  const [name, setName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [location, setLocation] = useState('');

  // -- Battery --
  const [battery, setBattery] = useState<BatteryStatus | null>(null);

  // -- UI state --
  const [saving, setSaving] = useState(false);
  const [reading, setReading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // -- Incoming serial buffer --
  const bufferRef = useRef('');

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [log]);

  // Reset confirm timeout
  useEffect(() => {
    if (!confirmReset) return;
    const id = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(id);
  }, [confirmReset]);

  // Save success feedback timeout
  useEffect(() => {
    if (!saveSuccess) return;
    const id = setTimeout(() => setSaveSuccess(false), 2500);
    return () => clearTimeout(id);
  }, [saveSuccess]);

  // -----------------------------------------------------------------------
  // Logging
  // -----------------------------------------------------------------------

  const addLog = useCallback((direction: LogEntry['direction'], message: string) => {
    setLog(prev => [...prev, { timestamp: ts(), direction, message }]);
  }, []);

  // -----------------------------------------------------------------------
  // Serial I/O
  // -----------------------------------------------------------------------

  const sendCommand = useCallback(async (cmd: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    const port = portRef.current;
    if (!port?.writable) return null;

    const payload = JSON.stringify(cmd) + '\n';
    addLog('tx', payload.trim());

    const encoder = new TextEncoder();
    const writer = port.writable.getWriter();
    try {
      await writer.write(encoder.encode(payload));
    } finally {
      writer.releaseLock();
    }

    // Wait for a complete JSON line from the read loop
    return new Promise<Record<string, unknown> | null>((resolve) => {
      const start = Date.now();

      const check = () => {
        const nlIndex = bufferRef.current.indexOf('\n');
        if (nlIndex !== -1) {
          const line = bufferRef.current.slice(0, nlIndex).trim();
          bufferRef.current = bufferRef.current.slice(nlIndex + 1);
          if (line) {
            addLog('rx', line);
            try {
              resolve(JSON.parse(line));
            } catch {
              addLog('error', `Invalid JSON: ${line}`);
              resolve(null);
            }
          } else {
            // Empty line, keep waiting
            if (Date.now() - start < READ_TIMEOUT_MS) {
              setTimeout(check, 20);
            } else {
              resolve(null);
            }
          }
          return;
        }
        if (Date.now() - start < READ_TIMEOUT_MS) {
          setTimeout(check, 20);
        } else {
          addLog('error', 'Response timeout');
          resolve(null);
        }
      };
      check();
    });
  }, [addLog]);

  // Background serial reader — pumps data into bufferRef
  const startReading = useCallback(async (port: SerialPort) => {
    if (!port.readable) return;

    const textDecoder = new TextDecoderStream();
    readableStreamClosedRef.current = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    readerRef.current = reader;

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          bufferRef.current += value;
        }
      }
    } catch {
      // Port closed or disconnected — handled elsewhere
    }
  }, []);

  // -----------------------------------------------------------------------
  // Connect / Disconnect
  // -----------------------------------------------------------------------

  const connect = useCallback(async () => {
    if (!('serial' in navigator)) return;
    setConnecting(true);
    addLog('info', 'Requesting serial port...');

    try {
      const port = await navigator.serial.requestPort({
        filters: [{ usbVendorId: RP2350_VENDOR_ID }],
      });

      await port.open({ baudRate: BAUD_RATE });
      portRef.current = port;
      addLog('info', `Port opened at ${BAUD_RATE} baud`);

      // Start background reader
      startReading(port);

      // Small delay for device to be ready
      await new Promise(r => setTimeout(r, 300));

      // Ping
      const pingResp = await sendCommand({ cmd: 'ping' });
      if (!pingResp || pingResp.status !== 'ok' || pingResp.device !== 'stasis-badge') {
        addLog('error', 'Device did not identify as stasis-badge');
        await port.close();
        portRef.current = null;
        setConnecting(false);
        return;
      }

      setDeviceVersion(String(pingResp.version ?? 'unknown'));
      setConnected(true);
      addLog('info', `Connected to stasis-badge v${pingResp.version}`);

      // Auto-read config
      const configResp = await sendCommand({ cmd: 'get_config' });
      if (configResp?.status === 'ok') {
        setName(String(configResp.name ?? ''));
        setPronouns(String(configResp.pronouns ?? ''));
        setLocation(String(configResp.location ?? ''));
        addLog('info', 'Configuration loaded from badge');
      }

      // Read battery
      const battResp = await sendCommand({ cmd: 'get_battery' });
      if (battResp?.status === 'ok') {
        setBattery({
          powerGood: Boolean(battResp.power_good),
          charging: Boolean(battResp.charging),
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (msg.includes('No port selected')) {
        addLog('info', 'Port selection cancelled');
      } else {
        addLog('error', `Connection failed: ${msg}`);
      }
    } finally {
      setConnecting(false);
    }
  }, [addLog, sendCommand, startReading]);

  const disconnect = useCallback(async () => {
    addLog('info', 'Disconnecting...');
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
        readerRef.current = null;
      }
      if (readableStreamClosedRef.current) {
        await readableStreamClosedRef.current.catch(() => {});
        readableStreamClosedRef.current = null;
      }
      if (portRef.current) {
        await portRef.current.close();
        portRef.current = null;
      }
    } catch {
      // Swallow close errors
    }
    setConnected(false);
    setDeviceVersion(null);
    setBattery(null);
    bufferRef.current = '';
    addLog('info', 'Disconnected');
  }, [addLog]);

  // Handle unexpected disconnect
  useEffect(() => {
    const handleDisconnect = (e: Event) => {
      const event = e as Event & { target: SerialPort };
      if (event.target === portRef.current) {
        setConnected(false);
        setDeviceVersion(null);
        setBattery(null);
        portRef.current = null;
        bufferRef.current = '';
        addLog('error', 'Device disconnected unexpectedly');
      }
    };

    navigator.serial?.addEventListener('disconnect', handleDisconnect);
    return () => {
      navigator.serial?.removeEventListener('disconnect', handleDisconnect);
    };
  }, [addLog]);

  // -----------------------------------------------------------------------
  // Badge operations
  // -----------------------------------------------------------------------

  const saveConfig = useCallback(async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const resp = await sendCommand({
        cmd: 'set_config',
        name: name.trim(),
        pronouns: pronouns.trim(),
        location: location.trim(),
      });
      if (resp?.status === 'ok') {
        addLog('info', 'Configuration saved to badge');
        setSaveSuccess(true);
      } else {
        addLog('error', `Save failed: ${JSON.stringify(resp)}`);
      }
    } catch (err: unknown) {
      addLog('error', `Save error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setSaving(false);
    }
  }, [name, pronouns, location, sendCommand, addLog]);

  const readConfig = useCallback(async () => {
    setReading(true);
    try {
      const resp = await sendCommand({ cmd: 'get_config' });
      if (resp?.status === 'ok') {
        setName(String(resp.name ?? ''));
        setPronouns(String(resp.pronouns ?? ''));
        setLocation(String(resp.location ?? ''));
        addLog('info', 'Configuration read from badge');
      } else {
        addLog('error', `Read failed: ${JSON.stringify(resp)}`);
      }

      const battResp = await sendCommand({ cmd: 'get_battery' });
      if (battResp?.status === 'ok') {
        setBattery({
          powerGood: Boolean(battResp.power_good),
          charging: Boolean(battResp.charging),
        });
      }
    } catch (err: unknown) {
      addLog('error', `Read error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setReading(false);
    }
  }, [sendCommand, addLog]);

  const factoryReset = useCallback(async () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    setResetting(true);
    try {
      const resp = await sendCommand({
        cmd: 'set_config',
        name: '',
        pronouns: '',
        location: '',
      });
      if (resp?.status === 'ok') {
        setName('');
        setPronouns('');
        setLocation('');
        addLog('info', 'Badge reset to factory defaults');
      } else {
        addLog('error', `Reset failed: ${JSON.stringify(resp)}`);
      }
    } catch (err: unknown) {
      addLog('error', `Reset error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setResetting(false);
    }
  }, [confirmReset, sendCommand, addLog]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  // Unsupported browser
  if (serialSupported === false) {
    return (
      <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">
        <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Image src="/stasis-logo.svg" alt="Stasis" width={120} height={40} className="h-10 w-auto" />
          </Link>
        </div>
        <main className="max-w-2xl mx-auto px-4 py-16 text-center">
          <h1 className="font-mono text-2xl text-brown-900 tracking-wider uppercase mb-6">
            BADGE CONFIGURATOR
          </h1>
          <div className="border border-cream-400 bg-cream-50/60 p-8">
            <div className="font-mono text-sm text-orange-600 uppercase tracking-wider mb-3">
              UNSUPPORTED BROWSER
            </div>
            <p className="font-sans text-brown-800 leading-relaxed mb-4">
              The Badge Configurator requires the WebSerial API, which is only available in
              <strong> Google Chrome</strong> or <strong>Microsoft Edge</strong> on desktop.
            </p>
            <p className="font-sans text-cream-600 text-sm">
              Firefox and Safari do not support WebSerial. Please open this page in Chrome or Edge to configure your badge.
            </p>
          </div>
        </main>
        <PlatformNoiseOverlay />
      </div>
    );
  }

  // Loading state (SSR safety)
  if (serialSupported === null) {
    return (
      <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">
        <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
          <Link href="/" className="hover:opacity-80 transition-opacity">
            <Image src="/stasis-logo.svg" alt="Stasis" width={120} height={40} className="h-10 w-auto" />
          </Link>
        </div>
        <main className="max-w-2xl mx-auto px-4 py-16 flex justify-center">
          <div className="loader" />
        </main>
        <PlatformNoiseOverlay />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(#DAD2BF99,#DAD2BF99),url(/noise-smooth.png)] font-mono relative overflow-hidden">
      {/* ── Header ── */}
      <div className="pl-3 pr-6 py-2 flex items-center justify-between border-b border-cream-400">
        <Link href="/" className="hover:opacity-80 transition-opacity">
          <Image src="/stasis-logo.svg" alt="Stasis" width={120} height={40} className="h-10 w-auto" />
        </Link>
        <Link
          href="/"
          className="text-orange-500 hover:text-orange-400 text-sm uppercase tracking-wide font-mono"
        >
          Home &rarr;
        </Link>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* ── Title ── */}
        <div className="mb-8">
          <HoverScramble
            segments={[{ text: 'BADGE CONFIGURATOR', class: 'text-brown-900' }]}
            className="font-mono text-2xl tracking-wider"
            initialScramble
            initialDuration={0.8}
          />
          <p className="font-sans text-cream-600 text-sm mt-2">
            Configure your Stasis Badge over USB. Connect your badge, enter your info, and write it to the device.
          </p>
        </div>

        {/* ── Connection ── */}
        <section className="mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            <MagneticCorners cornerSize={14} offset={5} activationDistance={40} deactivationDistance={50}>
              <button
                onClick={connected ? disconnect : connect}
                disabled={connecting}
                className="bg-brown-900 text-cream-100 font-mono text-sm uppercase tracking-wider px-5 py-2.5 hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect Badge'}
              </button>
            </MagneticCorners>

            {/* Status pill */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 ${
                  connected ? 'bg-orange-500 led-flicker' : 'bg-cream-500'
                }`}
              />
              <span className="font-mono text-xs uppercase tracking-wider text-cream-600">
                {connecting
                  ? 'Connecting...'
                  : connected
                    ? `Connected${deviceVersion ? ` // v${deviceVersion}` : ''}`
                    : 'Disconnected'}
              </span>
            </div>
          </div>
        </section>

        <div className="relative my-6">
          <DottedLine />
        </div>

        {/* ── Config Form ── */}
        <section className={`mb-6 transition-opacity ${connected ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="font-mono text-xs text-cream-600 uppercase tracking-wider mb-4">
            Badge Configuration
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="badge-name" className="block font-mono text-xs text-brown-800 uppercase tracking-wider mb-1">
                Name
                <span className="text-cream-500 ml-2 normal-case tracking-normal">
                  {name.length}/31
                </span>
              </label>
              <input
                id="badge-name"
                type="text"
                maxLength={31}
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={!connected}
                placeholder="Your name"
                className="w-full bg-cream-50 border border-cream-400 px-3 py-2 font-sans text-brown-900 text-sm placeholder:text-cream-500 focus:border-orange-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Pronouns */}
            <div>
              <label htmlFor="badge-pronouns" className="block font-mono text-xs text-brown-800 uppercase tracking-wider mb-1">
                Pronouns
                <span className="text-cream-500 ml-2 normal-case tracking-normal">
                  {pronouns.length}/15
                </span>
              </label>
              <input
                id="badge-pronouns"
                type="text"
                maxLength={15}
                value={pronouns}
                onChange={e => setPronouns(e.target.value)}
                disabled={!connected}
                placeholder="e.g. she/her, they/them"
                className="w-full bg-cream-50 border border-cream-400 px-3 py-2 font-sans text-brown-900 text-sm placeholder:text-cream-500 focus:border-orange-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>

            {/* Location */}
            <div>
              <label htmlFor="badge-location" className="block font-mono text-xs text-brown-800 uppercase tracking-wider mb-1">
                Location
                <span className="text-cream-500 ml-2 normal-case tracking-normal">
                  {location.length}/31
                </span>
              </label>
              <input
                id="badge-location"
                type="text"
                maxLength={31}
                value={location}
                onChange={e => setLocation(e.target.value)}
                disabled={!connected}
                placeholder="e.g. San Francisco, CA"
                className="w-full bg-cream-50 border border-cream-400 px-3 py-2 font-sans text-brown-900 text-sm placeholder:text-cream-500 focus:border-orange-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </section>

        {/* ── Action Buttons ── */}
        <section className={`mb-6 transition-opacity ${connected ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex flex-wrap gap-3">
            <MagneticCorners cornerSize={12} offset={4} activationDistance={35} deactivationDistance={45}>
              <button
                onClick={saveConfig}
                disabled={!connected || saving}
                className={`font-mono text-sm uppercase tracking-wider px-5 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  saveSuccess
                    ? 'bg-orange-500 text-cream-100'
                    : 'bg-brown-900 text-cream-100 hover:bg-orange-600'
                }`}
              >
                {saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save to Badge'}
              </button>
            </MagneticCorners>

            <MagneticCorners cornerSize={12} offset={4} activationDistance={35} deactivationDistance={45}>
              <button
                onClick={readConfig}
                disabled={!connected || reading}
                className="bg-cream-50 border border-cream-400 text-brown-900 font-mono text-sm uppercase tracking-wider px-5 py-2.5 hover:border-orange-500 hover:text-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reading ? 'Reading...' : 'Read from Badge'}
              </button>
            </MagneticCorners>

            <MagneticCorners cornerSize={12} offset={4} activationDistance={35} deactivationDistance={45}>
              <button
                onClick={factoryReset}
                disabled={!connected || resetting}
                className={`font-mono text-sm uppercase tracking-wider px-5 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  confirmReset
                    ? 'bg-orange-600 text-cream-100 border-glow'
                    : 'bg-cream-50 border border-cream-400 text-cream-600 hover:border-orange-500 hover:text-orange-600'
                }`}
              >
                {resetting ? 'Resetting...' : confirmReset ? 'Confirm Reset?' : 'Factory Reset'}
              </button>
            </MagneticCorners>
          </div>
        </section>

        <div className="relative my-6">
          <DottedLine />
        </div>

        {/* ── Battery Status ── */}
        {battery && (
          <section className="mb-6">
            <div className="font-mono text-xs text-cream-600 uppercase tracking-wider mb-3">
              Battery Status
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 ${battery.powerGood ? 'bg-orange-500' : 'bg-cream-500'}`}
                />
                <span className="font-mono text-xs text-brown-800 uppercase tracking-wider">
                  {battery.powerGood ? 'Power Good' : 'No Power'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 ${battery.charging ? 'bg-yellow-500' : 'bg-cream-500'}`}
                />
                <span className="font-mono text-xs text-brown-800 uppercase tracking-wider">
                  {battery.charging ? 'Charging' : 'Not Charging'}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ── Serial Log ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="font-mono text-xs text-cream-600 uppercase tracking-wider">
              Serial Log
            </div>
            {log.length > 0 && (
              <button
                onClick={() => setLog([])}
                className="font-mono text-xs text-cream-500 uppercase tracking-wider hover:text-orange-500 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="bg-brown-950 border border-brown-800 h-56 overflow-y-auto p-3 font-mono text-xs leading-relaxed">
            {log.length === 0 ? (
              <div className="text-cream-600 select-none">
                Waiting for connection...
              </div>
            ) : (
              log.map((entry, i) => (
                <div key={i} className="flex gap-2 whitespace-pre-wrap break-all">
                  <span className="text-cream-600 shrink-0 select-none">{entry.timestamp}</span>
                  <span
                    className={`shrink-0 select-none ${
                      entry.direction === 'tx'
                        ? 'text-orange-400'
                        : entry.direction === 'rx'
                          ? 'text-cream-300'
                          : entry.direction === 'error'
                            ? 'text-orange-600'
                            : 'text-cream-500'
                    }`}
                  >
                    {entry.direction === 'tx'
                      ? 'TX >'
                      : entry.direction === 'rx'
                        ? 'RX <'
                        : entry.direction === 'error'
                          ? 'ERR!'
                          : 'INFO'}
                  </span>
                  <span
                    className={
                      entry.direction === 'error'
                        ? 'text-orange-500'
                        : 'text-cream-200'
                    }
                  >
                    {entry.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </section>

        {/* ── Footer note ── */}
        <div className="mt-8 mb-4">
          <div className="relative my-4">
            <DottedLine />
          </div>
          <p className="font-mono text-xs text-cream-500 uppercase tracking-wider text-center">
            Stasis Badge // RP2350 // WebSerial {BAUD_RATE} baud
          </p>
        </div>
      </main>

      <PlatformNoiseOverlay />
    </div>
  );
}
