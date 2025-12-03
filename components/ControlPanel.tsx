import React from 'react';
import { Settings, Play, Square, Wifi, Radio } from 'lucide-react';
import { BAUD_RATES, DATA_BITS, STOP_BITS, PARITIES, FLOW_CONTROLS } from '../constants';
import { SerialConfig } from '../types';

interface ControlPanelProps {
  isTauri: boolean;
  config: SerialConfig;
  setConfig: (c: SerialConfig) => void;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  tcpEnabled: boolean;
  onToggleTcp: (enabled: boolean) => void;
  tcpPort: string;
  setTcpPort: (p: string) => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  isTauri,
  config,
  setConfig,
  isConnected,
  onConnect,
  onDisconnect,
  tcpEnabled,
  onToggleTcp,
  tcpPort,
  setTcpPort
}) => {
  
  const handleChange = (key: keyof SerialConfig, value: string | number) => {
    setConfig({ ...config, [key]: value });
  };

  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-y-auto shrink-0 z-20 shadow-xl">
      <div className="p-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur">
        <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2 uppercase tracking-wider">
          <Settings size={16} className="text-blue-500" />
          Serial Tool
        </h2>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {/* Connection Control */}
        <div className="space-y-3">
          {!isConnected ? (
            <button
              onClick={onConnect}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white py-2.5 px-4 rounded shadow-lg shadow-blue-900/30 font-semibold text-sm transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Play size={16} fill="currentColor" /> OPEN PORT
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white py-2.5 px-4 rounded shadow-lg shadow-red-900/30 font-semibold text-sm transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <Square size={16} fill="currentColor" /> CLOSE PORT
            </button>
          )}
          
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-500">
             <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-900'}`} />
             {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {/* Serial Settings */}
        <div className="space-y-4 pt-2">
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Baud Rate</label>
            <select
              disabled={isConnected}
              value={config.baudRate}
              onChange={(e) => handleChange('baudRate', parseInt(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 text-white text-xs rounded px-2 py-2 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              {BAUD_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
             <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Data Bits</label>
                <select
                disabled={isConnected}
                value={config.dataBits}
                onChange={(e) => handleChange('dataBits', parseInt(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 text-white text-xs rounded px-2 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                {DATA_BITS.map((bit) => (
                    <option key={bit} value={bit}>
                    {bit}
                    </option>
                ))}
                </select>
            </div>
            <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Stop Bits</label>
                <select
                disabled={isConnected}
                value={config.stopBits}
                onChange={(e) => handleChange('stopBits', parseInt(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 text-white text-xs rounded px-2 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                {STOP_BITS.map((bit) => (
                    <option key={bit} value={bit}>
                    {bit}
                    </option>
                ))}
                </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Parity</label>
            <select
              disabled={isConnected}
              value={config.parity}
              onChange={(e) => handleChange('parity', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 text-white text-xs rounded px-2 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {PARITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">Flow Control</label>
            <select
              disabled={isConnected}
              value={config.flowControl}
              onChange={(e) => handleChange('flowControl', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 text-white text-xs rounded px-2 py-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {FLOW_CONTROLS.map((fc) => (
                <option key={fc} value={fc}>
                  {fc === 'none' ? 'None' : 'Hardware (RTS/CTS)'}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TCP Forwarding Section - Only Visible in Tauri */}
        {isTauri && (
          <div className="border-t border-gray-800 pt-5 mt-2 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-gray-300 flex items-center gap-2 uppercase">
                <Wifi size={14} className={tcpEnabled ? "text-green-400" : "text-gray-500"} /> 
                TCP Server
              </label>
              <div className="relative inline-block w-8 h-4 align-middle select-none transition duration-200 ease-in">
                  <input 
                      type="checkbox" 
                      checked={tcpEnabled}
                      onChange={(e) => onToggleTcp(e.target.checked)}
                      className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 checked:border-blue-600 right-4 border-gray-300"
                  />
                  <label className={`toggle-label block overflow-hidden h-4 rounded-full cursor-pointer ${tcpEnabled ? 'bg-blue-600' : 'bg-gray-700'}`}></label>
              </div>
            </div>
            
            <div className="space-y-2 bg-gray-800/50 p-3 rounded-md border border-gray-800">
               <div className="flex items-center gap-2">
                   <label className="text-[10px] text-gray-500 uppercase font-bold w-12">Port</label>
                   <input 
                      type="number"
                      value={tcpPort}
                      onChange={(e) => setTcpPort(e.target.value)}
                      disabled={tcpEnabled}
                      className="flex-1 bg-gray-900 border border-gray-700 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500 disabled:opacity-50 text-right font-mono"
                      placeholder="8080"
                   />
               </div>
               
               {tcpEnabled && (
                  <div className="flex items-center gap-1.5 text-[10px] text-green-500">
                      <Radio size={10} className="animate-ping" />
                      Broadcasting on port {tcpPort}
                  </div>
               )}
            </div>
          </div>
        )}
      </div>

      <div 
         className="p-3 border-t border-gray-800 text-[10px] text-gray-600 text-center font-mono cursor-help"
         title={!isTauri ? "1. Ensure 'withGlobalTauri': true in tauri.conf.json\n2. Run via 'npm run tauri dev'\n3. Do not open in Chrome/Edge external browser" : "Tauri API Connected"}
      >
         {isTauri ? (
           <span className="text-green-900">Native Backend Active</span>
         ) : (
           <span className="text-yellow-800 hover:text-yellow-500 transition-colors">
              Web Mode / API Missing
           </span>
         )}
      </div>
    </div>
  );
};

export default ControlPanel;