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
  // i-on.pro extended fields
  install?: string[];
  tech?: string[];
  price?: number;
  product_types?: string[];
  category?: string;
}

export interface Catalog {
  version: number;
  totals: Record<Vendor, number>;
  by_type: Record<Vendor, Record<DeviceType, number>>;
  devices: Device[];
}

export type InstallStyle = "any" | "in_wall" | "din" | "panel";
export type ProtocolPref = "any" | "wifi_bt" | "zwave";

export interface Scenario {
  lightPoints: number;        // обычные группы освещения (вкл/выкл)
  dimmerPoints: number;       // диммируемые группы освещения
  rgbwPoints: number;         // RGBW-ленты
  socketPoints: number;       // умные розетки
  curtainPoints: number;      // приводы штор
  radiatorCount: number;      // кол-во радиаторов (термоголовки)
  floorHeatingZones: number;  // тёплый пол (термостаты с датчиком пола)
  motionPoints: number;       // датчики движения
  antiLeakZones: number;      // антипротечка (зоны: 3 датчика на зону — ванна, раковина, стиральная машина)
  doorPoints: number;         // охранка двери / окна
  needHub: boolean;           // нужен ли центральный сервер
  energyMonitoring: boolean;  // приоритет приборов с измерением мощности

  // ── контекст монтажа (Stage 2) ────────────────────────────────
  noNeutral: boolean;         // в подрозетнике нет нейтрали → нужны 1L/2L + Bypass
  installStyle: InstallStyle; // куда ставим: подрозетник / DIN / настенная панель / без разницы
  protocolPref: ProtocolPref; // Wi-Fi/BT (Pro/Plus/Gen3-4) или Z-Wave (Wave) или без разницы
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
