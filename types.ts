export enum BaudRate {
  B1200 = 1200,
  B2400 = 2400,
  B4800 = 4800,
  B9600 = 9600,
  B19200 = 19200,
  B38400 = 38400,
  B57600 = 57600,
  B115200 = 115200,
  B230400 = 230400,
  B460800 = 460800,
  B921600 = 921600,
}

export enum DataBits {
  SEVEN = 7,
  EIGHT = 8,
}

export enum StopBits {
  ONE = 1,
  TWO = 2,
}

export enum Parity {
  NONE = 'none',
  EVEN = 'even',
  ODD = 'odd',
}

export enum FlowControl {
  NONE = 'none',
  HARDWARE = 'hardware',
}

export type SerialConfig = {
  baudRate: number;
  dataBits: number;
  stopBits: number;
  parity: Parity;
  flowControl: FlowControl;
};

export enum ViewMode {
  TEXT = 'Text',
  HEX = 'Hex',
}

export enum SendMode {
  TEXT = 'Text',
  HEX = 'Hex',
}

export interface FileSendStatus {
  sending: boolean;
  progress: number; // 0 to 100
  filename: string;
  totalBytes: number;
  sentBytes: number;
  startTime: number;
}

// Global definition for Tauri interoperability (V1 and V2) and File System API
declare global {
  interface Window {
    __TAURI__?: {
      // Tauri V1
      invoke?: (cmd: string, args?: unknown) => Promise<any>;
      // Tauri V2
      core?: {
        invoke: (cmd: string, args?: unknown) => Promise<any>;
      };
      event: {
        listen: (event: string, handler: (event: any) => void) => Promise<() => void>;
      };
    };
    // File System Access API
    showSaveFilePicker?: (options?: any) => Promise<any>;
  }
  interface Navigator {
    serial: any;
  }
}