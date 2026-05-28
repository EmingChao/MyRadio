import db from './db';

/**
 * 初始化数据库，创建所有表和索引
 */
function initDb() {
  console.log('正在初始化数据库...');

  db.exec(`
    -- 歌曲表
    CREATE TABLE IF NOT EXISTS radio_track (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT,
      release_year INTEGER,
      genre_tags TEXT,
      mood_tags TEXT,
      source_type TEXT NOT NULL,
      source_track_id TEXT,
      cover_url TEXT,
      play_url TEXT,
      play_count INTEGER NOT NULL DEFAULT 0,
      liked INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      modified_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      create_user_no INTEGER,
      modified_user_no INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_track_user_source ON radio_track(user_id, source_type);
    CREATE INDEX IF NOT EXISTS idx_track_user_liked ON radio_track(user_id, liked);
    CREATE INDEX IF NOT EXISTS idx_track_source_id ON radio_track(source_track_id);

    -- 用户音乐画像表
    CREATE TABLE IF NOT EXISTS radio_user_profile (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      profile_name TEXT NOT NULL,
      favorite_genres TEXT,
      favorite_artists TEXT,
      favorite_years TEXT,
      language_preference TEXT,
      scene_preference TEXT,
      do_not_play TEXT,
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      modified_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      create_user_no INTEGER,
      modified_user_no INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_profile_user ON radio_user_profile(user_id);

    -- 歌单表
    CREATE TABLE IF NOT EXISTS radio_playlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      playlist_name TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_playlist_id TEXT,
      track_count INTEGER NOT NULL DEFAULT 0,
      memory TEXT,
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      modified_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      create_user_no INTEGER,
      modified_user_no INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_user_source ON radio_playlist(user_id, source_type);

    -- 歌单-歌曲关联表
    CREATE TABLE IF NOT EXISTS radio_playlist_track (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      track_id INTEGER NOT NULL,
      sort_no INTEGER NOT NULL DEFAULT 0,
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_plt_playlist ON radio_playlist_track(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_plt_track ON radio_playlist_track(track_id);

    -- 电台会话表
    CREATE TABLE IF NOT EXISTS radio_session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_title TEXT NOT NULL,
      scene TEXT,
      mood TEXT,
      weather_summary TEXT,
      calendar_summary TEXT,
      ai_summary TEXT,
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      modified_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      create_user_no INTEGER,
      modified_user_no INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_session_user_create ON radio_session(user_id, create_time);

    -- 电台队列表
    CREATE TABLE IF NOT EXISTS radio_session_track (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      track_id INTEGER NOT NULL,
      sort_no INTEGER NOT NULL,
      dj_script TEXT,
      recommend_reason TEXT,
      segue TEXT,
      play_status TEXT NOT NULL DEFAULT 'WAITING',
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_st_session_sort ON radio_session_track(session_id, sort_no);

    -- 每日计划表
    CREATE TABLE IF NOT EXISTS radio_daily_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_date TEXT NOT NULL,
      plan_title TEXT NOT NULL,
      weather_summary TEXT,
      ai_summary TEXT,
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      modified_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      create_user_no INTEGER,
      modified_user_no INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_plan_user_date ON radio_daily_plan(user_id, plan_date);

    -- 每日计划明细表
    CREATE TABLE IF NOT EXISTS radio_daily_plan_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      scene TEXT NOT NULL,
      mood TEXT,
      strategy_summary TEXT,
      source_playlist TEXT,
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE INDEX IF NOT EXISTS idx_plan_item_time ON radio_daily_plan_item(plan_id, start_time);

    -- 设备表
    CREATE TABLE IF NOT EXISTS radio_play_device (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      device_type TEXT NOT NULL,
      endpoint TEXT,
      default_device INTEGER NOT NULL DEFAULT 0,
      online_status TEXT NOT NULL DEFAULT 'UNKNOWN',
      create_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      modified_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      create_user_no INTEGER,
      modified_user_no INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_device_user ON radio_play_device(user_id, device_type);
  `);

  console.log('数据库初始化完成！');
}

// 直接运行时执行初始化
initDb();

export default initDb;
