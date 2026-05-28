#!/usr/bin/env node

/**
 * 网易云音乐数据导出脚本
 *
 * 功能：
 *   1. 扫码登录网易云音乐（推荐，最安全）
 *   2. 导出所有歌单及歌曲详情
 *   3. 导出喜欢的歌曲
 *   4. 导出每日推荐
 *   5. 导出听歌排行（所有时间 + 最近一周）
 *   6. 导出最近播放
 *
 * 用法：node scripts/export-netease.cjs
 *
 * @author LiuMingchao
 * Date 2026/05/27
 */

const api = require("NeteaseCloudMusicApi");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "..", "data");

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * 延时工具
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 扫码登录，获取 cookie
 */
async function loginByQrCode() {
  console.log("\n========== 网易云音乐扫码登录 ==========\n");

  // 第一步：获取登录二维码 key
  const keyRes = await api.login_qr_key();
  const unikey = keyRes.body.data.unikey;
  console.log("[1/3] 已获取二维码 key");

  // 第二步：生成二维码
  const qrRes = await api.login_qr_create({ key: unikey, qrimg: true });
  const qrBase64 = qrRes.body.data.qrimg;

  // 将二维码图片保存到本地
  const qrPath = path.join(OUTPUT_DIR, "login-qr.png");
  const imgData = qrBase64.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(qrPath, imgData, "base64");
  console.log(`[2/3] 二维码已保存到: ${qrPath}`);
  console.log("       请用网易云音乐 APP 扫描二维码登录\n");

  // 第三步：轮询检查扫码状态
  //   800: 二维码过期  801: 等待扫码
  //   802: 已扫码待确认  803: 登录成功
  let cookie = null;
  const maxRetry = 300; // 最多等 5 分钟

  for (let i = 0; i < maxRetry; i++) {
    await sleep(1000);
    const checkRes = await api.login_qr_check({ key: unikey });
    const code = checkRes.body.code;

    if (code === 800) {
      console.error("二维码已过期，请重新运行脚本");
      process.exit(1);
    } else if (code === 801) {
      // 等待扫码，静默
    } else if (code === 802) {
      console.log("[3/3] 已扫码，请在手机上确认登录...");
    } else if (code === 803) {
      // cookie 在响应头的 Set-Cookie 数组中
      cookie = checkRes.cookie;
      if (Array.isArray(cookie)) {
        cookie = cookie.join("; ");
      }
      console.log("[3/3] 登录成功！\n");
      break;
    }
  }

  if (!cookie) {
    console.error("登录超时，请重新运行脚本");
    process.exit(1);
  }

  // 保存 cookie 到文件，方便后续使用
  const cookiePath = path.join(OUTPUT_DIR, ".netease-cookie");
  fs.writeFileSync(cookiePath, cookie);
  console.log(`Cookie 已保存到: ${cookiePath}\n`);

  return cookie;
}

/**
 * 从文件加载已有 cookie
 */
function loadSavedCookie() {
  const cookiePath = path.join(OUTPUT_DIR, ".netease-cookie");
  if (fs.existsSync(cookiePath)) {
    return fs.readFileSync(cookiePath, "utf-8").trim();
  }
  return null;
}

/**
 * 安全调用 API，带重试
 */
async function safeCall(fn, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fn(params);
      if (res.body.code === 200) {
        return res.body;
      }
      if (res.body.code === 301 || res.body.code === 808) {
        throw new Error("需要重新登录");
      }
      console.warn(`  API 返回 code=${res.body.code}，重试 ${i + 1}/${retries}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000);
    }
  }
}

/**
 * 获取用户所有歌单及歌曲
 */
async function exportPlaylists(cookie, uid) {
  console.log(">>> 导出歌单列表...");

  const body = await safeCall(api.user_playlist, { uid, limit: 100, cookie });
  const playlists = body.playlist || [];

  console.log(`   找到 ${playlists.length} 个歌单\n`);

  const result = [];

  for (const pl of playlists) {
    const playlistInfo = {
      id: pl.id,
      name: pl.name,
      trackCount: pl.trackCount,
      creator: pl.creator?.nickname,
      description: pl.description,
      coverUrl: pl.coverImgUrl,
      createTime: pl.createTime,
      tags: pl.tags || [],
      tracks: [],
    };

    console.log(`   [${pl.name}] ${pl.trackCount} 首歌曲，正在获取...`);

    // 分批获取歌单内歌曲
    const batchSize = 500;
    for (let offset = 0; offset < pl.trackCount; offset += batchSize) {
      const trackBody = await safeCall(api.playlist_track_all, {
        id: pl.id,
        limit: batchSize,
        offset,
        cookie,
      });

      const songs = trackBody.songs || [];
      for (const song of songs) {
        playlistInfo.tracks.push({
          id: song.id,
          title: song.name,
          artists: song.ar?.map((a) => a.name).join(", "),
          album: song.al?.name,
          albumId: song.al?.id,
          coverUrl: song.al?.picUrl,
          duration: song.dt,
          publishTime: song.publishTime,
        });
      }

      if (offset + batchSize < pl.trackCount) {
        await sleep(200);
      }
    }

    console.log(`   [${pl.name}] 获取完成，共 ${playlistInfo.tracks.length} 首`);
    result.push(playlistInfo);
  }

  return result;
}

/**
 * 导出喜欢的歌曲 ID 列表
 */
async function exportLiked(cookie, uid) {
  console.log(">>> 导出喜欢歌曲列表...");

  const body = await safeCall(api.likelist, { uid, cookie });
  const ids = body.ids || [];

  console.log(`   找到 ${ids.length} 首喜欢的歌曲\n`);
  return ids;
}

/**
 * 导出每日推荐
 */
async function exportDailyRecommend(cookie) {
  console.log(">>> 导出每日推荐...");

  try {
    const body = await safeCall(api.recommend_songs, { cookie });
    const songs = body.data?.dailySongs || [];

    const result = songs.map((s) => ({
      id: s.id,
      title: s.name,
      artists: s.ar?.map((a) => a.name).join(", "),
      album: s.al?.name,
      coverUrl: s.al?.picUrl,
      reason: s.reason || s.recommendReason || "",
    }));

    console.log(`   每日推荐 ${result.length} 首\n`);
    return result;
  } catch (err) {
    console.warn("   每日推荐获取失败（可能需要会员），跳过\n");
    return [];
  }
}

/**
 * 导出听歌排行
 */
async function exportTopRecords(cookie, uid) {
  console.log(">>> 导出听歌排行...");

  const result = { allTime: [], recentWeek: [] };

  // 所有时间排行
  try {
    const allBody = await safeCall(api.user_record, { uid, type: 0, cookie });
    result.allTime = (allBody.allData || []).map((item) => ({
      id: item.song?.id,
      title: item.song?.name,
      artists: item.song?.ar?.map((a) => a.name).join(", "),
      album: item.song?.al?.name,
      playCount: item.playCount,
      score: item.score,
    }));
    console.log(`   所有时间排行: ${result.allTime.length} 首`);
  } catch (err) {
    console.warn("   所有时间排行获取失败（需开启听歌排行可见）");
  }

  // 最近一周排行
  try {
    const weekBody = await safeCall(api.user_record, { uid, type: 1, cookie });
    result.recentWeek = (weekBody.weekData || []).map((item) => ({
      id: item.song?.id,
      title: item.song?.name,
      artists: item.song?.ar?.map((a) => a.name).join(", "),
      album: item.song?.al?.name,
      playCount: item.playCount,
      score: item.score,
    }));
    console.log(`   最近一周排行: ${result.recentWeek.length} 首`);
  } catch (err) {
    console.warn("   最近一周排行获取失败");
  }

  console.log();
  return result;
}

/**
 * 导出最近播放
 */
async function exportRecentPlays(cookie) {
  console.log(">>> 导出最近播放...");

  try {
    const body = await safeCall(api.record_recent_song, { limit: 200, cookie });
    const data = body.data?.list || [];

    const result = data.map((item) => ({
      id: item.data?.id,
      title: item.data?.name,
      artists: item.data?.ar?.map((a) => a.name).join(", "),
      album: item.data?.al?.name,
      playTime: item.playTime,
    }));

    console.log(`   最近播放: ${result.length} 首\n`);
    return result;
  } catch (err) {
    console.warn("   最近播放获取失败，跳过\n");
    return [];
  }
}

/**
 * 主流程
 */
async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     网易云音乐数据导出工具           ║");
  console.log("╚══════════════════════════════════════╝\n");

  // 尝试使用保存的 cookie
  let cookie = loadSavedCookie();
  let uid = null;

  if (cookie) {
    console.log("检测到已保存的 Cookie，尝试使用...");
    try {
      const testBody = await safeCall(api.user_playlist, {
        uid: 0,
        limit: 1,
        cookie,
      });
      if (testBody.playlist && testBody.playlist.length > 0) {
        uid = testBody.playlist[0].userId;
        console.log(`Cookie 有效，用户 ID: ${uid}\n`);
      } else {
        console.log("Cookie 已失效，需要重新登录\n");
        cookie = null;
      }
    } catch (err) {
      console.log("Cookie 已失效，需要重新登录\n");
      cookie = null;
    }
  }

  // Cookie 无效则扫码登录
  if (!cookie) {
    cookie = await loginByQrCode();
    // 登录后首次拉取获取 UID
    try {
      const testBody = await safeCall(api.user_playlist, {
        uid: 0,
        limit: 1,
        cookie,
      });
      if (testBody.playlist && testBody.playlist.length > 0) {
        uid = testBody.playlist[0].userId;
        console.log(`用户 ID: ${uid}\n`);
      }
    } catch (err) {
      console.error("获取用户信息失败:", err.message);
    }
  }

  if (!uid) {
    console.error("无法获取用户 ID，请检查登录状态");
    process.exit(1);
  }

  // 开始导出
  console.log("══════════════════════════════════════");
  console.log("   开始导出数据...");
  console.log("══════════════════════════════════════\n");

  const startTime = Date.now();

  // 并行导出
  const [playlists, likedIds, dailyRecommend, topRecords, recentPlays] =
    await Promise.all([
      exportPlaylists(cookie, uid),
      exportLiked(cookie, uid),
      exportDailyRecommend(cookie),
      exportTopRecords(cookie, uid),
      exportRecentPlays(cookie),
    ]);

  // 组装最终数据
  const exportData = {
    exportTime: new Date().toISOString(),
    userId: uid,
    summary: {
      totalPlaylists: playlists.length,
      totalTracks: playlists.reduce((sum, p) => sum + p.tracks.length, 0),
      likedCount: likedIds.length,
      dailyRecommendCount: dailyRecommend.length,
      allTimeTopCount: topRecords.allTime.length,
      recentWeekTopCount: topRecords.recentWeek.length,
      recentPlaysCount: recentPlays.length,
    },
    playlists,
    likedSongIds: likedIds,
    dailyRecommend,
    topRecords,
    recentPlays,
  };

  // 保存到 JSON 文件
  const outputPath = path.join(OUTPUT_DIR, "netease-export.json");
  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2), "utf-8");

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("══════════════════════════════════════");
  console.log("   导出完成！");
  console.log("══════════════════════════════════════\n");
  console.log(`   耗时: ${elapsed}s`);
  console.log(`   输出: ${outputPath}`);
  console.log(`   大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB\n`);
  console.log("   数据概览:");
  console.log(`   - 歌单数:      ${exportData.summary.totalPlaylists}`);
  console.log(`   - 歌曲总数:    ${exportData.summary.totalTracks}`);
  console.log(`   - 喜欢歌曲:    ${exportData.summary.likedCount}`);
  console.log(`   - 每日推荐:    ${exportData.summary.dailyRecommendCount}`);
  console.log(`   - 听歌排行:    ${exportData.summary.allTimeTopCount}`);
  console.log(`   - 最近播放:    ${exportData.summary.recentPlaysCount}\n`);
}

main().catch((err) => {
  console.error("\n导出失败:", err.message);
  process.exit(1);
});
