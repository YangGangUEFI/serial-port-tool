import { BaudRate, DataBits, StopBits, Parity, FlowControl } from './types';

export const BAUD_RATES = Object.values(BaudRate).filter((v) => typeof v === 'number') as number[];
export const DATA_BITS = [DataBits.SEVEN, DataBits.EIGHT];
export const STOP_BITS = [StopBits.ONE, StopBits.TWO];
export const PARITIES = Object.values(Parity);
export const FLOW_CONTROLS = Object.values(FlowControl);

export const DEFAULT_CONFIG = {
  baudRate: BaudRate.B115200,
  dataBits: DataBits.EIGHT,
  stopBits: StopBits.ONE,
  parity: Parity.NONE,
  flowControl: FlowControl.NONE,
};