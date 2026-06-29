/**
 * IP 地理定位服务 — 使用 ip-api.com（免费，无需 API Key，45 次/分钟）
 */

// 缓存：按 IP 缓存坐标，24 小时 TTL
const geoCache = new Map<string, { lat: number; lon: number; city: string }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 小时
const cacheTimestamps = new Map<string, number>();

interface IpApiResponse {
  status: string;
  lat: number;
  lon: number;
  city: string;
}

/**
 * 判断是否为内网 IP（无法定位，直接跳过）
 */
function isPrivateIp(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip)
  );
}

/**
 * 根据 IP 解析经纬度坐标
 * @returns 坐标对象，内网 IP 或解析失败时返回 null
 */
export async function resolveCoords(ip: string): Promise<{ lat: number; lon: number } | null> {
  // 内网 IP 无法定位
  if (!ip || isPrivateIp(ip)) {
    return null;
  }

  // 检查缓存
  const cached = geoCache.get(ip);
  const cachedTime = cacheTimestamps.get(ip);
  if (cached && cachedTime && Date.now() - cachedTime < CACHE_TTL) {
    return { lat: cached.lat, lon: cached.lon };
  }

  try {
    const url = `http://ip-api.com/json/${ip}?fields=status,lat,lon,city&lang=zh`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ip-api.com 响应: ${response.status}`);
    }

    const data = await response.json() as IpApiResponse;
    if (data.status !== 'success') {
      console.warn(`[IP-Geo] IP ${ip} 定位失败: ${data.status}`);
      return null;
    }

    // 写入缓存
    geoCache.set(ip, { lat: data.lat, lon: data.lon, city: data.city });
    cacheTimestamps.set(ip, Date.now());

    console.log(`[IP-Geo] IP ${ip} → ${data.city} (${data.lat}, ${data.lon})`);
    return { lat: data.lat, lon: data.lon };
  } catch (err: any) {
    console.error(`[IP-Geo] IP ${ip} 定位异常:`, err.message);
    return null;
  }
}
