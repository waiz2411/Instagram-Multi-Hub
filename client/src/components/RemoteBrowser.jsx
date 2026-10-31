import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Smartphone,
  Monitor,
  Maximize2,
  Minimize2,
  X,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Loader2,
  Send,
  Compass,
  Home,
  ExternalLink,
  Zap,
  Activity,
  Clipboard
} from 'lucide-react';
import { api } from '../api';

export default function RemoteBrowser({ account, onClose, onAccountUpdated }) {
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const containerRef = useRef(null);
  const lastMoveRef = useRef(0);
  const frameCountRef = useRef(0);
  const onAccountUpdatedRef = useRef(onAccountUpdated);

  useEffect(() => {
    onAccountUpdatedRef.current = onAccountUpdated;
  }, [onAccountUpdated]);

  const [connected, setConnected] = useState(false);
  const [url, setUrl] = useState('https://www.instagram.com/accounts/login/');
  const [inputUrl, setInputUrl] = useState('https://www.instagram.com/accounts/login/');
  const [isMobile, setIsMobile] = useState(Boolean(account.isMobile));
  const [viewport, setViewport] = useState(
    account.isMobile ? { width: 430, height: 932 } : { width: 1280, height: 800 }
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectSuccess, setDetectSuccess] = useState(account.status === 'connected');
  const [notification, setNotification] = useState(null);
  const [fps, setFps] = useState(0);
  const [latency, setLatency] = useState(15);
  const [isLaunchingNative, setIsLaunchingNative] = useState(false);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // FPS Counter
  useEffect(() => {
    const interval = setInterval(() => {
      setFps(frameCountRef.current);
      frameCountRef.current = 0;
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const send = useCallback((payload) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Connect to live binary WebSocket stream - dynamically adapts to local dev & cloud production
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.port === '3000'
      ? `${window.location.hostname}:5000`
      : window.location.host;
    const wsUrl = `${protocol}//${wsHost}/ws/browser/${account.id}`;

    console.log('[RemoteBrowser] Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'blob';
    wsRef.current = ws;

    const t0 = performance.now();

    ws.onopen = () => {
      console.log('[RemoteBrowser] WebSocket connected successfully');
      setConnected(true);
      setLatency(Math.max(5, Math.round(performance.now() - t0)));
    };

    ws.onmessage = async (event) => {
      // 1. Binary JPEG frame (ultra-fast hardware decoding)
      if (event.data instanceof Blob) {
        setConnected(true);
        try {
          const bitmap = await createImageBitmap(event.data);
          const canvas = canvasRef.current;
          if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            bitmap.close();
            frameCountRef.current++;
          }
        } catch (err) {
          // Fallback to Image element with ObjectURL
          const blobUrl = URL.createObjectURL(event.data);
          const img = new Image();
          img.onload = () => {
            const canvas = canvasRef.current;
            if (canvas) {
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              frameCountRef.current++;
            }
            URL.revokeObjectURL(blobUrl);
          };
          img.src = blobUrl;
        }
        return;
      }

      // 2. Control JSON message
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'navigated') {
          setUrl(msg.url);
          setInputUrl(msg.url);
        } else if (msg.type === 'account_detected') {
          if (onAccountUpdatedRef.current) {
            onAccountUpdatedRef.current(msg.account);
          }
          if (msg.account.status === 'connected') {
            setDetectSuccess(true);
            showNotification(`Connected as @${msg.account.username}!`);
          }
        } else if (msg.type === 'session_ready') {
          setConnected(true);
          if (msg.url) {
            setUrl(msg.url);
            setInputUrl(msg.url);
          }
          if (msg.viewport) {
            setViewport(msg.viewport);
          }
        } else if (msg.type === 'error') {
          console.error('[RemoteBrowser] Server message:', msg.message);
          showNotification('Notice: ' + msg.message);
        }
      } catch (err) {
        console.error('[RemoteBrowser] JSON parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[RemoteBrowser] WebSocket closed');
      setConnected(false);
    };

    ws.onerror = (err) => {
      console.error('[RemoteBrowser] WebSocket error:', err);
      setConnected(false);
    };

    return () => {
      console.log('[RemoteBrowser] Cleaning up WebSocket');
      ws.close();
    };
  }, [account.id]);

  // Adjust canvas resolution
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.width = viewport.width;
      canvasRef.current.height = viewport.height;
    }
  }, [viewport]);

  // Auto focus viewport so user can type immediately
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, [connected]);

  // Coordinates scaling
  const getCoords = (e) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = viewport.width / rect.width;
    const scaleY = viewport.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (e) => {
    const { x, y } = getCoords(e);
    const buttons = ['left', 'middle', 'right'];
    send({
      type: 'mouse_down',
      x,
      y,
      button: buttons[e.button] || 'left'
    });
  };

  const handleMouseUp = (e) => {
    const { x, y } = getCoords(e);
    const buttons = ['left', 'middle', 'right'];
    send({
      type: 'mouse_up',
      x,
      y,
      button: buttons[e.button] || 'left'
    });
  };

  // Throttled mouse move (40 events/sec max)
  const handleMouseMove = (e) => {
    const now = performance.now();
    if (now - lastMoveRef.current < 25) return;
    lastMoveRef.current = now;
    const { x, y } = getCoords(e);
    send({
      type: 'mouse_move',
      x,
      y
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const { x, y } = getCoords(e);
    send({
      type: 'mouse_wheel',
      x,
      y,
      deltaX: e.deltaX,
      deltaY: e.deltaY
    });
  };

  const handleKeyDown = (e) => {
    // Prevent host page scrolling
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'PageUp', 'PageDown'].includes(e.code)) {
      e.preventDefault();
    }

    // Ctrl or Meta combinations (e.g. Ctrl+V, Ctrl+C, Ctrl+A)
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'v') {
        // Allow native paste event to fire!
        return;
      }
      send({
        type: 'special_key',
        key: e.key,
        code: e.code,
        keyCode: e.keyCode,
        modifiers: (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
      });
      return;
    }

    // Navigation and control keys (Enter, Backspace, Delete, Arrows, Tab, etc.)
    if (e.key.length > 1) {
      send({
        type: 'special_key',
        key: e.key,
        code: e.code,
        keyCode: e.keyCode
      });
      return;
    }

    // Single character typing (a-z, 0-9, punctuation, space)
    send({
      type: 'char_input',
      text: e.key
    });
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData ? e.clipboardData.getData('text') : '';
    if (pastedText) {
      send({
        type: 'insert_text',
        text: pastedText
      });
      showNotification('Pasted text from clipboard!');
    }
  };

  const handleManualPasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        send({
          type: 'insert_text',
          text
        });
        showNotification('Pasted clipboard text into active input!');
      } else {
        showNotification('Clipboard is empty.');
      }
    } catch (err) {
      // If clipboard permission prompt refused, prompt user
      const text = prompt('Paste your text / password here:');
      if (text) {
        send({
          type: 'insert_text',
          text
        });
      }
    }
  };

  const handleKeyUp = (e) => {
    // Handled in special_key or char_input directly
  };

  const handleNavigateSubmit = (e) => {
    e.preventDefault();
    let dest = inputUrl.trim();
    if (!dest.startsWith('http://') && !dest.startsWith('https://')) {
      dest = 'https://' + dest;
    }
    send({ type: 'navigate', url: dest });
  };

  const toggleViewportMode = () => {
    const nextMobile = !isMobile;
    const nextViewport = nextMobile
      ? { width: 430, height: 932 }
      : { width: 1280, height: 800 };

    setIsMobile(nextMobile);
    setViewport(nextViewport);
    send({
      type: 'set_viewport',
      width: nextViewport.width,
      height: nextViewport.height,
      isMobile: nextMobile
    });
  };

  const handleSyncAccount = async () => {
    setIsDetecting(true);
    try {
      const res = await api.syncAccount(account.id);
      if (res.success && res.account) {
        if (onAccountUpdatedRef.current) onAccountUpdatedRef.current(res.account);
        if (res.account.status === 'connected') {
          setDetectSuccess(true);
          showNotification(`Authenticated as @${res.account.username}!`);
        } else {
          showNotification('Login pending: please enter credentials on screen.');
        }
      }
    } catch (err) {
      showNotification('Sync failed: ' + err.message);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleLaunchNative = async () => {
    setIsLaunchingNative(true);
    try {
      await api.openNativeWindow(account.id);
      showNotification('Desktop Chrome window launched! You can log in directly.');
    } catch (err) {
      alert('Could not launch native window: ' + err.message);
    } finally {
      setIsLaunchingNative(false);
    }
  };

  const quickNavigate = (targetUrl) => {
    setInputUrl(targetUrl);
    send({ type: 'navigate', url: targetUrl });
  };

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-xl transition-all ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-5'
      }`}
    >
      <div className="flex flex-col h-full w-full max-w-7xl mx-auto rounded-3xl bg-slate-900/90 border border-slate-700/60 shadow-2xl shadow-pink-500/10 overflow-hidden">
        {/* macOS Style Window Frame Top Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-950/80 border-b border-slate-800/80 gap-4">
          {/* Left Traffic Lights & Account Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 mr-2">
              <button
                onClick={onClose}
                className="w-3.5 h-3.5 rounded-full bg-rose-500 hover:bg-rose-600 transition"
                title="Close"
              />
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="w-3.5 h-3.5 rounded-full bg-amber-500 hover:bg-amber-600 transition"
                title="Toggle Fullscreen"
              />
              <button
                onClick={toggleViewportMode}
                className="w-3.5 h-3.5 rounded-full bg-emerald-500 hover:bg-emerald-600 transition"
                title="Toggle Mobile/Desktop"
              />
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600">
                <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center overflow-hidden">
                  {account.profilePic ? (
                    <img src={account.profilePic} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-bold text-white uppercase">
                      {(account.username || 'IG')[0]}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-xs font-bold text-white block leading-tight">
                  @{account.username || 'new_account'}
                </span>
                <span className="text-[10px] text-slate-400 block -mt-0.5">
                  {account.assignedListName ? `List: ${account.assignedListName}` : 'No List Assigned'}
                </span>
              </div>
            </div>
          </div>

          {/* Center Address & Navigation Bar */}
          <div className="flex-1 max-w-xl flex items-center gap-2">
            <div className="flex items-center gap-1 text-slate-400">
              <button
                onClick={() => send({ type: 'go_back' })}
                className="p-1 rounded-lg hover:bg-slate-800 hover:text-white transition"
                title="Back"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => send({ type: 'go_forward' })}
                className="p-1 rounded-lg hover:bg-slate-800 hover:text-white transition"
                title="Forward"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => send({ type: 'reload' })}
                className="p-1 rounded-lg hover:bg-slate-800 hover:text-white transition"
                title="Reload"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleNavigateSubmit} className="flex-1">
              <div className="relative flex items-center">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 absolute left-3" />
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://www.instagram.com"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500 transition font-mono"
                />
              </div>
            </form>
          </div>

          {/* Right Action Tools */}
          <div className="flex items-center gap-2">
            {/* Quick Instagram tabs */}
            <button
              onClick={() => quickNavigate('https://www.instagram.com/')}
              title="Feed"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Home className="w-4 h-4" />
            </button>
            <button
              onClick={() => quickNavigate('https://www.instagram.com/direct/inbox/')}
              title="Direct Messages"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              onClick={() => quickNavigate('https://www.instagram.com/explore/')}
              title="Explore"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <Compass className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-800 mx-1" />

            {/* Paste from Clipboard */}
            <button
              onClick={handleManualPasteClipboard}
              title="Paste text from your clipboard into active input (or press Ctrl+V)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700/80 cursor-pointer"
            >
              <Clipboard className="w-3.5 h-3.5 text-pink-400" />
              <span className="hidden sm:inline">Paste</span>
            </button>

            {/* Launch Native Desktop Window */}
            <button
              onClick={handleLaunchNative}
              disabled={isLaunchingNative}
              title="Open full Google Chrome window directly on your desktop"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition border border-slate-700"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Desktop Window</span>
            </button>

            {/* Detect / Re-Sync Session */}
            <button
              onClick={handleSyncAccount}
              disabled={isDetecting}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition ${
                detectSuccess
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 text-white shadow-lg shadow-pink-500/20 hover:opacity-90'
              }`}
            >
              {isDetecting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{detectSuccess ? 'Session Active' : 'Detect Login'}</span>
                </>
              )}
            </button>

            {/* Device Mode Toggle */}
            <button
              onClick={toggleViewportMode}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
            >
              {isMobile ? (
                <Smartphone className="w-3.5 h-3.5 text-pink-400" />
              ) : (
                <Monitor className="w-3.5 h-3.5 text-blue-400" />
              )}
              <span className="hidden md:inline">{isMobile ? 'Mobile' : 'Desktop'}</span>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Live Canvas Viewport Container */}
        <div
          className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center p-3 select-none"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
        >
          {notification && (
            <div className="absolute top-5 z-30 px-4 py-2 rounded-2xl bg-emerald-600/90 text-white font-semibold text-xs shadow-2xl backdrop-blur flex items-center gap-2 animate-bounce">
              <CheckCircle2 className="w-4 h-4" />
              {notification}
            </div>
          )}

          {!connected && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm gap-3">
              <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
              <p className="text-sm font-semibold text-slate-300">
                Connecting to high-speed isolated browser stream...
              </p>
            </div>
          )}

          {/* Screen Wrapper styled to match device */}
          <div
            className={`relative rounded-2xl overflow-hidden border border-slate-800 bg-black shadow-2xl transition-all ${
              isMobile
                ? 'max-h-[82vh] aspect-[430/932] ring-8 ring-slate-800/80'
                : 'w-full h-full max-h-[82vh] ring-1 ring-slate-800'
            }`}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseMove={handleMouseMove}
              onWheel={handleWheel}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full cursor-pointer select-none block object-contain"
            />
          </div>
        </div>

        {/* Live Status Bar */}
        <div className="px-5 py-2.5 bg-slate-950/90 border-t border-slate-800/80 text-xs text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {connected ? 'Live CDP Stream' : 'Connecting'}
            </span>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" /> Latency: {latency}ms
            </span>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Activity className="w-3 h-3 text-pink-400" /> Frame rate: {fps} FPS
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <span>
              💡 Click & type directly on screen. Or click <strong>"Desktop Window"</strong> for zero-latency Chrome.
            </span>
            <span className="text-slate-400 font-mono">
              {viewport.width} x {viewport.height}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
