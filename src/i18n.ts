/**
 * Перевод ключей характеристик Shelly (английский → русский).
 * Дополняется по мере поступления новых ключей.
 */
const ATTR_RU: Record<string, string> = {
  // Питание
  "Power supply": "Питание",
  "Power supply AC": "Питание AC",
  "Power supply DC": "Питание DC",
  "Power consumption": "Потребляемая мощность",
  "Device power consumption": "Потребление устройства",
  "Max. output power": "Макс. выходная мощность",
  "Max. RF power": "Макс. мощность РЧ",
  "Max. altitude": "Макс. высота над уровнем моря",
  "Max. switching voltage": "Макс. коммутируемое напряжение",
  "Max. switching current": "Макс. коммутируемый ток",
  "Max. switching current AC": "Макс. ток AC",
  "Max. switching current DC": "Макс. ток DC",
  // Корпус и монтаж
  "Shell material": "Материал корпуса",
  "Shell color": "Цвет корпуса",
  "Color": "Цвет",
  "Terminals color": "Цвет клемм",
  "Size": "Размеры",
  "Size (HxWxD)": "Размеры (В×Ш×Г)",
  "Size (H x W x D)": "Размеры (В×Ш×Г)",
  "Weight": "Вес",
  "Mounting": "Монтаж",
  "Conductor cross section": "Сечение проводника",
  "Conductor stripped length": "Длина зачистки",
  "Screw terminals max torque": "Макс. момент затяжки клемм",
  // Климат
  "Humidity": "Влажность",
  "Ambient working temperature": "Рабочая температура",
  "Ambient temperature": "Окружающая температура",
  "Operational temperature": "Эксплуатационная температура",
  "Internal-temperature sensor": "Встроенный датчик температуры",
  "Temperature sensor": "Датчик температуры",
  "Humidity sensor": "Датчик влажности",
  "Light sensor": "Датчик освещённости",
  // Связь
  "Range": "Радиус действия",
  "RF band": "Радиочастотный диапазон",
  "RF bands": "Радиочастотные диапазоны",
  "Wi-Fi Range": "Радиус Wi-Fi",
  "Wi-Fi protocol": "Протокол Wi-Fi",
  "Bluetooth": "Bluetooth",
  "Bluetooth Range": "Радиус Bluetooth",
  "Bluetooth Protocol": "Протокол Bluetooth",
  "Protocol": "Протокол",
  "Encryption": "Шифрование",
  "MQTT": "MQTT",
  "CoAP": "CoAP",
  "UDP": "UDP",
  "Webhooks (URL actions)": "Webhooks (URL-действия)",
  "Scripting": "Скрипты",
  "Schedules": "Расписания",
  "Advanced schedules": "Расширенные расписания",
  "KVS (Key-Value Store)": "KVS (хранилище ключ-значение)",
  // Аппаратное
  "CPU": "CPU",
  "RAM": "RAM",
  "Flash": "Flash-память",
  "Quantity": "Количество",
  // Измерения
  "Voltmeter (AC)": "Вольтметр (AC)",
  "Ammeter (AC)": "Амперметр (AC)",
  "Voltmeter accuracy": "Точность вольтметра",
  "Power and energy meters": "Счётчики мощности и энергии",
  "Power measurement": "Измерение мощности",
  "Measurement data storage": "Хранение данных измерений",
  // Защита и нормы
  "External protection": "Внешняя защита",
  "Overheating protection": "Защита от перегрева",
  "Overload protection": "Защита от перегрузки",
  "Pollution degree": "Степень загрязнения",
  "Overvoltage category": "Категория перенапряжения",
  "Rated impulse-withstand voltage": "Импульсное выдерживаемое напряжение",
  "Glow-wire temperature": "Температура раскалённой проволоки",
  "Required forced cooling": "Требуется принудительное охлаждение",
  "Number of switching cycles": "Число циклов коммутации",
  "Duty-type": "Режим работы",
  "Switch type": "Тип переключателя",
  "Switch configuration": "Схема подключения",
  "Type of circuit disconnection": "Тип отключения цепи",
  "Type": "Тип",
  // Прочее
  "Estimated battery life": "Расчётный срок батареи",
  "Battery type": "Тип батареи",
  "Compatible plugs": "Совместимые вилки",
  "Compatible sockets": "Совместимые розетки",
  "Neutral not needed": "Нейтраль не требуется",
  "Distance": "Расстояние",
};

/** Перевод популярных значений (boolean-флаги, единицы и т.п.) */
const VALUE_RU: Array<[RegExp, string]> = [
  [/^yes$/i, "да"],
  [/^no$/i, "нет"],
  [/^optional$/i, "опционально"],
  [/^required$/i, "требуется"],
  [/^supported$/i, "поддерживается"],
  [/^not supported$/i, "не поддерживается"],
  [/\bplastic\b/gi, "пластик"],
  [/\bmetal\b/gi, "металл"],
  [/\bwhite\b/gi, "белый"],
  [/\bblack\b/gi, "чёрный"],
  [/\bgrey|gray\b/gi, "серый"],
  [/\bDIN rail\b/gi, "DIN-рейка"],
  [/\bwall\b/gi, "настенный"],
  [/\bin-?wall\b/gi, "встраиваемый"],
];

export function tAttrKey(k: string): string {
  return ATTR_RU[k] ?? k;
}

export function tAttrValue(v: string): string {
  let out = String(v);
  for (const [re, ru] of VALUE_RU) out = out.replace(re, ru);
  return out;
}
