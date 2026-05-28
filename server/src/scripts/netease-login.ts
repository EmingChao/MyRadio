import fs from 'fs';
import path from 'path';
import { login_qr_key, login_qr_create, login_qr_check, login_status } from 'NeteaseCloudMusicApi';

const COOKIE_FILE = path.resolve(__dirname, '../../data/netease-cookie.txt');

/**
 * 网易云 QR 码登录
 * 生成二维码 → 等待扫码 → 保存 cookie
 */
async function qrLogin() {
  console.log('=== 网易云音乐 QR 码登录 ===\n');

  // 1. 获取 unikey
  const keyRes = await login_qr_key({ timestamp: Date.now() });
  const unikey = keyRes.body.data.unikey;
  if (!unikey) {
    console.error('获取 unikey 失败');
    process.exit(1);
  }

  // 2. 生成二维码 URL
  const qrRes = await login_qr_create({ key: unikey, qrimg: 'true', timestamp: Date.now() });
  const qrurl = qrRes.body.data.qrurl;
  const qrimg = qrRes.body.data.qrimg; // base64 图片

  console.log('请使用网易云音乐 APP 扫描以下二维码登录：\n');
  console.log(qrurl);
  console.log('');

  // 保存二维码图片
  if (qrimg) {
    const imgPath = path.resolve(__dirname, '../../data/login-qr.png');
    const base64Data = qrimg.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(imgPath, Buffer.from(base64Data, 'base64'));
    console.log(`二维码已保存到: ${imgPath}`);
    console.log('请用手机网易云 APP 扫码登录\n');
  }

  // 3. 轮询检查扫码状态
  let cookie = '';
  let attempts = 0;
  const maxAttempts = 60; // 最多等 2 分钟

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 2000));
    attempts++;

    try {
      const checkRes = await login_qr_check({ key: unikey, timestamp: Date.now() });
      const code = checkRes.body.code;

      if (code === 803) {
        // 登录成功
        cookie = checkRes.body.cookie;
        console.log('\n登录成功！');
        break;
      } else if (code === 800) {
        console.log('二维码已过期，请重新运行脚本');
        process.exit(1);
      } else if (code === 801) {
        // 等待扫码
        if (attempts % 5 === 0) {
          console.log('等待扫码中...');
        }
      } else if (code === 802) {
        console.log('已扫码，等待确认...');
      }
    } catch (err: any) {
      console.error('检查状态失败:', err.message);
    }
  }

  if (!cookie) {
    console.log('\n登录超时，请重新运行脚本');
    process.exit(1);
  }

  // 4. 保存 cookie 到文件
  fs.writeFileSync(COOKIE_FILE, cookie);
  console.log(`\nCookie 已保存到: ${COOKIE_FILE}`);

  // 5. 验证登录状态
  try {
    const statusRes = await login_status({ cookie });
    const profile = statusRes.body.data?.profile;
    if (profile) {
      console.log(`\n当前登录用户: ${profile.nickname} (ID: ${profile.userId})`);
    }
  } catch {
    // 登录状态检查失败不影响主流程
  }

  console.log('\n接下来可以运行 fetch-play-urls 重新获取完整播放地址');
}

qrLogin().catch(err => {
  console.error('登录失败:', err);
  process.exit(1);
});
