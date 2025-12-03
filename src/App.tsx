import React, { useState, useEffect, useRef } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import { Trash2, Save, Send, Clock, FileUp, XCircle, Search, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';

import ControlPanel from './components/ControlPanel';
import HexView from './components/HexView';
import { DEFAULT_CONFIG } from './constants';
import { SerialConfig, ViewMode, SendMode, FileSendStatus } from './types';

// --- Main Component ---

const App: React.FC = () => {
  // --- State ---
  const [isTauri, setIsTauri] = useState(false);
  const [config, setConfig] = useState<SerialConfig>(DEFAULT_CONFIG);
  const [isConnected, setIsConnected] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.TEXT);
  const [showTimestamp, setShowTimestamp] = useState(false);
  
  // Input State
  const [inputMode, setInputMode] = useState<SendMode>(SendMode.TEXT);
  const [inputText, setInputText] = useState('');
  const [autoNewline, setAutoNewline] = useState(true);
  
  // File Send State
  const [fileStatus, setFileStatus] = useState<FileSendStatus | null>(null);
  
  // TCP State
  const [tcpEnabled, setTcpEnabled] = useState(false);
  const [tcpPort, setTcpPort] = useState('8080');
  // FIX: Use Ref to avoid stale closure in the read loop
  const tcpEnabledRef = useRef(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data Refs 
  const chunksRef = useRef<Uint8Array[]>([]);
  const [dataVersion, setDataVersion] = useState(0); 
  const lastRenderTimeRef = useRef(0);
  const renderTimeoutRef = useRef<number | null>(null);
  
  // Web Serial Refs
  const portRef = useRef<any>(null);
  const readerRef = useRef<any>(null);
  const writerRef = useRef<any>(null);
  const keepReadingRef = useRef(false);

  // Terminal Refs
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);

  // --- Sync Ref with State ---
  useEffect(() => {
    tcpEnabledRef.current = tcpEnabled;
  }, [tcpEnabled]);

  // --- Helper: Safe Invoke (Handles Tauri V1 vs V2) ---
  const safeInvoke = async (cmd: string, args: any = {}) => {
    if (!window.__TAURI__) throw new Error("Tauri API not found");

    // Try Tauri V2 (window.__TAURI__.core.invoke)
    if (window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
        return await window.__TAURI__.core.invoke(cmd, args);
    }

    // Try Tauri V1 (window.__TAURI__.invoke)
    if (typeof window.__TAURI__.invoke === 'function') {
        return await window.__TAURI__.invoke(cmd, args);
    }

    throw new Error("No valid Tauri invoke function found. Are you running in Tauri?");
  };

  // --- Initialization ---

  useEffect(() => {
    const checkTauri = !!window.__TAURI__;
    setIsTauri(checkTauri);
    
    console.log(`[Environment] Tauri Detected: ${checkTauri}`);

    const term = new XTerminal({
      cursorBlink: true,
      theme: {
        background: '#0d0d0d',
        foreground: '#e5e7eb',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      allowProposedApi: true,
      convertEol: true, 
      scrollback: 10000, 
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    if (terminalRef.current) {
      // Safety clear
      terminalRef.current.innerHTML = '';
      term.open(terminalRef.current);
      fitAddon.fit();
    }

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  // Update layout when view mode changes
  useEffect(() => {
    if (viewMode === ViewMode.TEXT && fitAddonRef.current) {
        requestAnimationFrame(() => fitAddonRef.current?.fit());
    }
  }, [viewMode]);

  // Handle Search Auto-Update
  useEffect(() => {
    if (viewMode === ViewMode.TEXT && searchAddonRef.current) {
      if (searchQuery) {
        searchAddonRef.current.findNext(searchQuery, { 
          incremental: true, 
          decorations: { 
            matchBackground: '#854d0e', // Darker yellow/orange for non-active matches
            matchOverviewRuler: '#854d0e',
            activeMatchBackground: '#eab308', // Bright yellow for active match
            activeMatchColorOverviewRuler: '#eab308'
          } 
        });
      }
    }
  }, [searchQuery, viewMode]);

  const handleSearchNext = () => {
    if (viewMode === ViewMode.TEXT && searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findNext(searchQuery, {
        decorations: {
            matchBackground: '#854d0e',
            matchOverviewRuler: '#854d0e',
            activeMatchBackground: '#eab308',
            activeMatchColorOverviewRuler: '#eab308'
        }
      });
    }
  };

  const handleSearchPrev = () => {
    if (viewMode === ViewMode.TEXT && searchAddonRef.current && searchQuery) {
      searchAddonRef.current.findPrevious(searchQuery, {
        decorations: {
            matchBackground: '#854d0e',
            matchOverviewRuler: '#854d0e',
            activeMatchBackground: '#eab308',
            activeMatchColorOverviewRuler: '#eab308'
        }
      });
    }
  };

  // --- Core Logic ---

  const handleDataReceived = async (chunk: Uint8Array) => {
    // 1. Append to Chunk List (O(1) operation)
    chunksRef.current.push(chunk);

    // 2. Write to Terminal immediately (no React cycle)
    if (xtermRef.current) {
       xtermRef.current.write(chunk);
    }

    // 3. Fire and forget TCP (Don't await to prevent blocking reader)
    if (tcpEnabledRef.current) {
      broadcastToTcp(chunk).catch(e => console.error(e));
    }

    // 4. Update UI (Hex View) with Throttling (Max 10fps)
    const now = Date.now();
    if (now - lastRenderTimeRef.current > 100) {
        setDataVersion(v => v + 1);
        lastRenderTimeRef.current = now;
        // Clear any pending trailing update
        if (renderTimeoutRef.current) {
            clearTimeout(renderTimeoutRef.current);
            renderTimeoutRef.current = null;
        }
    } else {
        // Schedule a trailing update to ensure last chunk is rendered if stream stops
        if (!renderTimeoutRef.current) {
            renderTimeoutRef.current = window.setTimeout(() => {
                setDataVersion(v => v + 1);
                lastRenderTimeRef.current = Date.now();
                renderTimeoutRef.current = null;
            }, 110);
        }
    }
  };

  const broadcastToTcp = async (data: Uint8Array) => {
    if (isTauri && window.__TAURI__) {
       await safeInvoke('broadcast_data', { 
         data: Array.from(data) 
       });
    }
  };

  // --- TCP Server Toggle ---

  const handleToggleTcp = async (enabled: boolean) => {
    if (!isTauri) {
        setTcpEnabled(enabled);
        return;
    }

    if (!window.__TAURI__) return;

    if (enabled) {
        try {
            const port = parseInt(tcpPort);
            if (isNaN(port)) throw new Error("Invalid port");
            
            const msg = await safeInvoke('start_tcp_server', { port });
            console.log(msg);
            setTcpEnabled(true);
        } catch (e: any) {
            console.error(e);
            alert(`Failed to start TCP Server: ${e}`);
            setTcpEnabled(false);
        }
    } else {
        try {
            await safeInvoke('stop_tcp_server');
            setTcpEnabled(false);
        } catch (e: any) {
            console.error(e);
            alert(`Failed to stop TCP Server: ${e}`);
        }
    }
  };

  const connectPort = async () => {
    try {
      if (!navigator.serial) {
        alert("Web Serial API not supported in this environment.");
        return;
      }

      const port = await navigator.serial.requestPort();
      await port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        flowControl: config.flowControl,
      });

      portRef.current = port;
      keepReadingRef.current = true;
      
      // Start Reading
      readLoop(port);
      writerRef.current = port.writable.getWriter();
      
      setIsConnected(true);
      
    } catch (err) {
      console.error("Connection failed", err);
    }
  };

  const readLoop = async (port: any) => {
    let reader;
    try {
        reader = port.readable.getReader();
        readerRef.current = reader;
    } catch (e) {
        console.error("Failed to get reader", e);
        return;
    }

    try {
      while (keepReadingRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
           await handleDataReceived(value);
        }
      }
    } catch (error) {
      console.error("Read Error", error);
    } finally {
      reader.releaseLock();
    }
  };

  const disconnectPort = async () => {
    keepReadingRef.current = false;
    
    if (readerRef.current) {
        try { await readerRef.current.cancel(); } catch (e) { }
        readerRef.current = null;
    }

    if (writerRef.current) {
        try { await writerRef.current.releaseLock(); } catch (e) { }
        writerRef.current = null;
    }

    if (portRef.current) {
        try { await portRef.current.close(); } catch (e) { }
        portRef.current = null;
    }
    
    setIsConnected(false);
  };

  // --- Sending Logic ---

  const sendData = async (data: Uint8Array) => {
    if (!writerRef.current) return;
    try {
        await writerRef.current.write(data);
    } catch (e) {
        console.error("Write error", e);
        alert("Failed to send data");
    }
  };

  const handleSendText = async () => {
    if (!inputText) return;
    
    let payload: Uint8Array;

    if (inputMode === SendMode.HEX) {
      const cleanHex = inputText.replace(/[^0-9A-Fa-f]/g, '');
      if (cleanHex.length % 2 !== 0) {
        alert("Invalid Hex: Length must be even.");
        return;
      }
      const match = cleanHex.match(/.{1,2}/g);
      const bytes = match ? match.map(byte => parseInt(byte, 16)) : [];
      payload = new Uint8Array(bytes);
    } else {
      const encoder = new TextEncoder();
      const textToSend = autoNewline ? inputText + '\r\n' : inputText;
      payload = encoder.encode(textToSend);
    }

    await sendData(payload);
    setInputText(''); 
  };

  // --- File Sending ---

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelFileSendRef = useRef(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isConnected) return;

    cancelFileSendRef.current = false;
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    
    setFileStatus({
      sending: true,
      filename: file.name,
      totalBytes: data.length,
      sentBytes: 0,
      progress: 0,
      startTime: Date.now()
    });

    const CHUNK_SIZE = 4096; 
    const msPerByte = (10 / config.baudRate) * 1000;
    const delayPerChunk = Math.ceil(CHUNK_SIZE * msPerByte);

    const sendLoop = async () => {
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        if (cancelFileSendRef.current || !isConnected) break;

        const end = Math.min(i + CHUNK_SIZE, data.length);
        const chunk = data.slice(i, end);
        
        await sendData(chunk);
        
        setFileStatus(prev => prev ? ({
          ...prev,
          sentBytes: end,
          progress: Math.floor((end / data.length) * 100)
        }) : null);

        // Minimal delay to prevent flooding
        if (delayPerChunk > 0) {
           await new Promise(resolve => setTimeout(resolve, delayPerChunk));
        }
      }
      setFileStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    sendLoop();
  };

  const cancelFileSend = () => {
    cancelFileSendRef.current = true;
    setFileStatus(null);
  };

  // --- Utilities ---

  const clearScreen = () => {
    // 1. Clear Xterm
    if (xtermRef.current) {
        xtermRef.current.reset();
        xtermRef.current.clear();
        xtermRef.current.write('\x1b[2J\x1b[3J\x1b[H'); // ANSI Clear Screen + Scrollback + Home
    }
    // 2. Clear Chunks
    chunksRef.current = [];
    // 3. Force Render
    setDataVersion(0);
  };

  const saveLog = async () => {
    // Flatten data for saving
    const totalLength = chunksRef.current.reduce((acc, c) => acc + c.length, 0);
    const fullData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunksRef.current) {
        fullData.set(chunk, offset);
        offset += chunk.length;
    }
    
    const extension = viewMode === ViewMode.TEXT ? 'txt' : 'bin';
    const filename = `serial_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;

    // Pure Frontend Solution: Use File System Access API if available
    if (typeof window.showSaveFilePicker === 'function') {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: filename,
                types: [{
                    description: viewMode === ViewMode.TEXT ? 'Text File' : 'Binary File',
                    accept: {
                        [viewMode === ViewMode.TEXT ? 'text/plain' : 'application/octet-stream']: ['.' + extension],
                    },
                }],
            });
            const writable = await handle.createWritable();
            await writable.write(fullData);
            await writable.close();
            return; // Success
        } catch (err: any) {
            if (err.name === 'AbortError') return; // User cancelled
            console.error('File System Access API failed:', err);
            // Fallback to blob download
        }
    }

    // Fallback: Blob Download
    downloadBlob(fullData, filename, viewMode === ViewMode.TEXT ? 'text/plain' : 'application/octet-stream');
  };

  const downloadBlob = (data: Uint8Array, filename: string, mimeType: string) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* Sidebar Controls */}
      <ControlPanel 
        isTauri={isTauri}
        config={config} 
        setConfig={setConfig} 
        isConnected={isConnected}
        onConnect={connectPort}
        onDisconnect={disconnectPort}
        tcpEnabled={tcpEnabled}
        onToggleTcp={handleToggleTcp}
        tcpPort={tcpPort}
        setTcpPort={setTcpPort}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Toolbar */}
        <div className="bg-gray-800 p-2 flex items-center gap-3 border-b border-gray-700 shadow-sm z-10">
          <div className="flex bg-gray-900 rounded p-0.5 border border-gray-700">
            <button
              onClick={() => setViewMode(ViewMode.TEXT)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                viewMode === ViewMode.TEXT ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              TEXT / ANSI
            </button>
            <button
              onClick={() => setViewMode(ViewMode.HEX)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                viewMode === ViewMode.HEX ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              HEX
            </button>
          </div>

          <div className="h-6 w-px bg-gray-600"></div>

          <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer hover:text-white select-none">
            <div className={`w-4 h-4 border rounded flex items-center justify-center ${showTimestamp ? 'bg-blue-600 border-blue-600' : 'border-gray-500'}`}>
              {showTimestamp && <Clock size={10} className="text-white" />}
            </div>
            <input 
              type="checkbox" 
              checked={showTimestamp} 
              onChange={(e) => setShowTimestamp(e.target.checked)}
              className="hidden"
            />
            <span>Timestamp</span>
          </label>

          <div className="flex-1"></div>

          {/* Improved Search Bar */}
          <div className="flex items-center bg-gray-900 border border-gray-600 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
            <div className="pl-2 pr-1 text-gray-500 flex items-center justify-center">
                <Search size={14} />
            </div>
            <input 
              type="text" 
              placeholder="Find..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                      e.preventDefault();
                      if (e.shiftKey) handleSearchPrev();
                      else handleSearchNext();
                  }
              }}
              className="bg-transparent border-none focus:ring-0 text-xs text-white w-32 focus:w-48 transition-all placeholder-gray-600 h-7"
            />
            <div className="h-4 w-px bg-gray-700 mx-0.5"></div>
            <div className="flex">
                <button 
                    onClick={handleSearchPrev}
                    className="p-1 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                    title="Previous (Shift+Enter)"
                >
                    <ChevronUp size={14} />
                </button>
                <button 
                    onClick={handleSearchNext}
                    className="p-1 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                    title="Next (Enter)"
                >
                    <ChevronDown size={14} />
                </button>
            </div>
          </div>

          <div className="h-6 w-px bg-gray-600 mx-2"></div>

          <div className="flex gap-2">
            <button 
                onClick={clearScreen}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-900/30 hover:bg-red-900/50 border border-red-900/50 rounded text-red-200 transition-colors"
            >
                <Trash2 size={14} /> Clear
            </button>
            <button 
                onClick={saveLog}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded text-gray-200 transition-colors"
            >
                <Save size={14} /> Save
            </button>
          </div>
        </div>

        {/* Terminal/View Area */}
        <div ref={terminalContainerRef} className="flex-1 relative bg-[#0d0d0d] overflow-hidden">
           <div 
             ref={terminalRef} 
             className={`absolute inset-0 p-1 ${viewMode === ViewMode.TEXT ? 'visible' : 'invisible'}`}
           />
           
           {viewMode === ViewMode.HEX && (
             <div className="absolute inset-0 z-10">
               <HexView 
                 chunks={chunksRef.current} 
                 timestampVisible={showTimestamp} 
                 searchQuery={searchQuery}
                 dataVersion={dataVersion}
               />
             </div>
           )}

           {chunksRef.current.length === 0 && !isConnected && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 pointer-events-none">
                <AlertTriangle size={48} className="mb-4 opacity-20" />
                <p>Not Connected</p>
                <p className="text-xs mt-2 text-gray-500">
                   Click "OPEN PORT" to select a device.
                </p>
                {!isTauri && (
                  <div className="mt-4 p-3 bg-gray-900/80 rounded border border-gray-800 text-[10px] text-yellow-600 max-w-md text-center">
                     Running in Web Mode. TCP Forwarding is disabled.<br/>
                     Make sure to set <code className="text-yellow-400">withGlobalTauri: true</code> in tauri.conf.json
                  </div>
                )}
             </div>
           )}

           {fileStatus && (
             <div className="absolute bottom-4 right-4 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl p-4 w-72 z-50 animate-in slide-in-from-bottom-5 fade-in">
               <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileUp size={16} className="text-blue-400 shrink-0" />
                    <span className="text-xs font-bold text-white truncate">{fileStatus.filename}</span>
                  </div>
                  <button onClick={cancelFileSend} className="text-gray-400 hover:text-red-500 transition-colors">
                    <XCircle size={16} />
                  </button>
               </div>
               <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden mb-2">
                 <div 
                   className="bg-blue-500 h-full transition-all duration-300 ease-out" 
                   style={{ width: `${fileStatus.progress}%` }}
                 />
               </div>
               <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                 <span>{(fileStatus.sentBytes / 1024).toFixed(1)} KB / {(fileStatus.totalBytes / 1024).toFixed(1)} KB</span>
                 <span>{fileStatus.progress}%</span>
               </div>
             </div>
           )}
        </div>

        {/* Bottom Input Area */}
        <div className="bg-gray-800 p-3 border-t border-gray-700">
          <div className="flex gap-3">
            
            <div className="flex flex-col gap-2 shrink-0 w-32">
               <div className="flex bg-gray-900 rounded border border-gray-600 p-0.5">
                 <button
                    onClick={() => setInputMode(SendMode.TEXT)}
                    className={`flex-1 text-[10px] uppercase font-bold py-1 rounded ${inputMode === SendMode.TEXT ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                 >
                    Text
                 </button>
                 <button
                    onClick={() => setInputMode(SendMode.HEX)}
                    className={`flex-1 text-[10px] uppercase font-bold py-1 rounded ${inputMode === SendMode.HEX ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                 >
                    Hex
                 </button>
               </div>

               <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                 <input 
                   type="checkbox" 
                   checked={autoNewline}
                   onChange={(e) => setAutoNewline(e.target.checked)}
                   className="rounded accent-blue-500 w-3.5 h-3.5"
                 />
                 <span>Append \r\n</span>
               </label>
            </div>

            <div className="flex-1 relative">
              <input 
                type="text" 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendText();
                    }
                }}
                disabled={!isConnected}
                placeholder={!isConnected ? "Open connection to send data..." : (inputMode === SendMode.HEX ? "AA BB CC 12..." : "Type command...")}
                className={`w-full h-full bg-gray-900 border border-gray-600 rounded-md px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 placeholder-gray-600 font-mono transition-colors ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                autoComplete="off"
                spellCheck="false"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
                {inputMode === SendMode.HEX ? 'HEX' : 'ASCII'}
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0 w-32">
               <button 
                 onClick={handleSendText}
                 disabled={!isConnected || !inputText}
                 className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 rounded text-sm font-medium flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
               >
                 Send <Send size={14} />
               </button>

               <div className="flex gap-1 h-8">
                 <input 
                   type="file" 
                   ref={fileInputRef}
                   onChange={handleFileSelect}
                   className="hidden" 
                   disabled={!isConnected || !!fileStatus}
                 />
                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   disabled={!isConnected || !!fileStatus}
                   className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors border border-gray-600"
                   title="Send Binary File"
                 >
                   <FileUp size={14} /> File
                 </button>
               </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default App;