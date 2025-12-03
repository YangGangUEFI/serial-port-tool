import React, { useMemo } from 'react';

interface HexViewProps {
  chunks: Uint8Array[]; // Changed to array of chunks
  timestampVisible: boolean;
  searchQuery: string;
  dataVersion: number; // Force render trigger
}

// Helper to sanitize non-printable ASCII characters for the right-side text preview
const getPrintableChar = (byte: number) => {
  return byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
};

const HexView: React.FC<HexViewProps> = ({ chunks, timestampVisible, searchQuery }) => {
  
  // Flatten all chunks into a single view buffer
  const { viewData, totalLength } = useMemo(() => {
    // 1. Calculate total size
    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    
    // 2. Allocate buffer
    const result = new Uint8Array(total);
    let offset = 0;

    // 3. Fill buffer
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return { viewData: result, totalLength: total };
  }, [chunks, chunks.length]); // chunks.length usually sufficient to trigger update for refs pushed

  // Memoize the rendering of rows
  // Note: Without virtualization, rendering very large datasets (MBs) may cause UI lag.
  const rows = useMemo(() => {
    const result = [];
    const bytesPerRow = 16;
    
    for (let i = 0; i < viewData.length; i += bytesPerRow) {
      const chunk = viewData.slice(i, i + bytesPerRow);
      const absoluteOffset = i.toString(16).padStart(8, '0').toUpperCase();
      
      const hexParts: string[] = [];
      const asciiParts: string[] = [];

      for (let j = 0; j < bytesPerRow; j++) {
        if (j < chunk.length) {
          const byte = chunk[j];
          const hex = byte.toString(16).padStart(2, '0').toUpperCase();
          hexParts.push(hex);
          asciiParts.push(getPrintableChar(byte));
        } else {
          hexParts.push('  ');
          asciiParts.push(' ');
        }
      }

      // Formatting for 8-byte split
      const hexString = hexParts.slice(0, 8).join(' ') + '  ' + hexParts.slice(8).join(' ');
      const asciiString = asciiParts.join('');

      const isMatch = searchQuery && (hexString.includes(searchQuery.toUpperCase()) || asciiString.includes(searchQuery));

      result.push(
        <div key={i} className={`flex font-mono text-xs hover:bg-gray-800/50 leading-5 ${isMatch ? 'bg-yellow-900/30' : ''}`}>
          {timestampVisible && (
            <span className="text-green-500/70 mr-3 select-none w-20 text-right shrink-0">
               --:--:--
            </span>
          )}
          <span className="text-gray-500 mr-4 select-none w-20 text-right shrink-0">{absoluteOffset}</span>
          <span className="text-cyan-400 mr-4 whitespace-pre">{hexString}</span>
          <span className="text-yellow-100/80 border-l border-gray-700 pl-4 truncate">{asciiString}</span>
        </div>
      );
    }
    return result;
  }, [viewData, timestampVisible, searchQuery]);

  return (
    <div className="h-full w-full overflow-auto bg-[#0d0d0d] p-4 text-white custom-scrollbar flex flex-col">
      {totalLength === 0 && (
          <div className="h-full flex items-center justify-center text-gray-700 italic">
              No data received
          </div>
      )}
      
      <div>
        {rows}
      </div>
    </div>
  );
};

export default HexView;