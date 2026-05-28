/** 歌曲 */
export interface Track {
  id: number;
  user_id: number;
  title: string;
  artist: string;
  album: string | null;
  release_year: number | null;
  genre_tags: string | null;
  mood_tags: string | null;
  source_type: string;
  source_track_id: string | null;
  cover_url: string | null;
  play_url: string | null;
  play_count: number;
  liked: number;
  skipped_count: number;
  create_time: string;
  modified_time: string;
  create_user_no: number | null;
  modified_user_no: number | null;
}

/** 歌单 */
export interface Playlist {
  id: number;
  user_id: number;
  playlist_name: string;
  source_type: string;
  source_playlist_id: string | null;
  track_count: number;
  memory: string | null;
  create_time: string;
  modified_time: string;
  create_user_no: number | null;
  modified_user_no: number | null;
}

/** 歌单-歌曲关联 */
export interface PlaylistTrack {
  id: number;
  playlist_id: number;
  track_id: number;
  sort_no: number;
  create_time: string;
}

/** 电台会话 */
export interface RadioSession {
  id: number;
  user_id: number;
  session_title: string;
  scene: string | null;
  mood: string | null;
  weather_summary: string | null;
  calendar_summary: string | null;
  ai_summary: string | null;
  create_time: string;
  modified_time: string;
  create_user_no: number | null;
  modified_user_no: number | null;
}

/** 电台队列条目 */
export interface SessionTrack {
  id: number;
  session_id: number;
  track_id: number;
  sort_no: number;
  dj_script: string | null;
  recommend_reason: string | null;
  play_status: string;
  create_time: string;
}

/** 每日计划 */
export interface DailyPlan {
  id: number;
  user_id: number;
  plan_date: string;
  plan_title: string;
  weather_summary: string | null;
  ai_summary: string | null;
  create_time: string;
  modified_time: string;
  create_user_no: number | null;
  modified_user_no: number | null;
}

/** 每日计划明细 */
export interface DailyPlanItem {
  id: number;
  plan_id: number;
  start_time: string;
  end_time: string;
  scene: string;
  mood: string | null;
  strategy_summary: string | null;
  source_playlist: string | null;
  create_time: string;
}

/** 播放设备 */
export interface PlayDevice {
  id: number;
  user_id: number;
  device_name: string;
  device_type: string;
  endpoint: string | null;
  default_device: number;
  online_status: string;
  create_time: string;
  modified_time: string;
  create_user_no: number | null;
  modified_user_no: number | null;
}

/** 用户音乐画像 */
export interface UserProfile {
  id: number;
  user_id: number;
  profile_name: string;
  favorite_genres: string | null;
  favorite_artists: string | null;
  favorite_years: string | null;
  language_preference: string | null;
  scene_preference: string | null;
  do_not_play: string | null;
  create_time: string;
  modified_time: string;
  create_user_no: number | null;
  modified_user_no: number | null;
}

/** 网易云导出的歌曲数据 */
export interface NeteaseTrack {
  id: number;
  title: string;
  artists: string;
  album: string;
  albumId?: number;
  coverUrl?: string;
  duration?: number;
  publishTime?: number;
  reason?: string;
}

/** 网易云导出的歌单数据 */
export interface NeteasePlaylist {
  id: number;
  name: string;
  trackCount: number;
  creator: string;
  description: string | null;
  coverUrl: string;
  createTime: number;
  tags: string[];
  tracks: NeteaseTrack[];
}
