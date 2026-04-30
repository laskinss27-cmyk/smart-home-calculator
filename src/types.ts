export type DeviceType =
  | "relay"
  | "dimmer"
  | "rgbw"
  | "drive"
  | "smart_plug"
  | "motion_sensor"
  | "leak_sensor"
  | "valve"
  | "door_sensor"
  | "temperature_humidity"
  | "floor_temp_sensor"
  | "thermostat"
  | "energy_meter"
  | "wall_switch"
  | "hub"
  | "kit"
  | "bulb"
  | "other";

export type Vendor = "shelly" | "hitepro";

export interface Device {
  vendor: Vendor;
  id: string;
  title: string;
  url: string;
  image: string | null;
  type: DeviceType;
  channels: number;
  power_metering: boolean;
  voltage: string | null;
  protocol: string | null;
  raw_attributes: Record<string, string>;
}

export interface Catalog {
  version: number;
  totals: Record<Vendor, number>;
  by_type: Record<Vendor, Record<DeviceType, number>>;
  devices: Device[];
}

export interface Scenario {
  lightPoints: number;        // обычные группы освещения (вкл/выкл)
  dimmerPoints: number;       // диммируемые группы освещения
  rgbwPoints: number;         // RGBW-ленты
  socketPoints: number;       // умные розетки
  curtainPoints: number;      // приводы штор
  heatingZones: number;       // отопление (термоголовки/реле котла)
  floorHeatingZones: number;  // тёплый пол (термостаты с датчиком пола)
  motionPoints: number;       // датчики движения
  leakPoints: number;         // антипротечка (датчики)
  doorPoints: number;         // охранка двери / окна
  thPoints: number;           // температура+влажность
  needHub: boolean;           // нужен ли центральный сервер
  energyMonitoring: boolean;  // приоритет приборов с измерением мощности
}

export interface PickedItem {
  device: Device;
  qty: number;
  reason: string;
}

export interface Recommendation {
  vendor: Vendor;
  items: PickedItem[];
  totalDevices: number;
  gaps: string[];   // сценарии, которые вендор не покрывает
  notes: string[];  // подсказки/допущения
}
