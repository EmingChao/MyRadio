/**
 * 天气服务 — 使用 Open-Meteo API（免费，无需 API Key）
 */

export interface WeatherData {
  temperature: number;    // 当前温度 (°C)
  weatherCode: number;    // 天气代码
  description: string;    // 天气描述
  precipitation: number;  // 降水量 (mm)
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    weather_code: number;
    precipitation?: number;
  };
}

// WMO 天气代码映射
const WEATHER_CODES: Record<number, string> = {
  0: '晴',
  1: '大部晴',
  2: '多云',
  3: '阴天',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  80: '阵雨',
  81: '中阵雨',
  82: '大阵雨',
  95: '雷暴',
  96: '雷暴伴冰雹',
  99: '强雷暴伴冰雹',
};

// 缓存：按坐标 key 区分，避免不同位置的天气互相覆盖
const weatherCache = new Map<string, { data: WeatherData; time: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟

/**
 * 获取当前天气
 */
export async function getWeather(latitude?: number, longitude?: number): Promise<WeatherData> {
  const lat = latitude ?? Number(process.env.LATITUDE) ?? 31.23;
  const lon = longitude ?? Number(process.env.LONGITUDE) ?? 121.47;
  const cacheKey = `${lat},${lon}`;

  // 检查缓存
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code&timezone=Asia/Shanghai`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo API 错误: ${response.status}`);
    }

    const data = await response.json() as OpenMeteoResponse;
    const current = data.current;

    const result: WeatherData = {
      temperature: Math.round(current.temperature_2m * 10) / 10,
      weatherCode: current.weather_code,
      description: WEATHER_CODES[current.weather_code] || '未知',
      precipitation: current.precipitation || 0,
    };
    weatherCache.set(cacheKey, { data: result, time: Date.now() });

    return result;
  } catch (err: any) {
    console.error('[Weather] 获取天气失败:', err.message);
    // 返回默认值
    return {
      temperature: 0,
      weatherCode: 0,
      description: '未知',
      precipitation: 0,
    };
  }
}

/**
 * 格式化天气为上下文字符串
 */
export async function getWeatherSummary(latitude?: number, longitude?: number): Promise<string> {
  const weather = await getWeather(latitude, longitude);
  let summary = `${weather.description}，${weather.temperature}°C`;
  if (weather.precipitation > 0) {
    summary += `，降水${weather.precipitation}mm`;
  }
  return summary;
}
