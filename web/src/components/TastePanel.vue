<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getTasteProfile, getTastePlaylists } from '../api'

interface TasteData {
  signatures: string[]
  favoriteGenres: string[]
  favoriteArtists: Array<{ name: string; count?: number; likedCount?: number }>
  lifelongTop: Array<{ title: string; artist: string; year?: number }>
  doNotPlay: string[]
  byTimeOfDay: Record<string, string[]>
  byMood: Record<string, string[]>
  playlists: Array<{ id: number; playlist_name: string; track_count: number; memory: string }>
}

const taste = ref<TasteData | null>(null)
const playlists = ref<any[]>([])
const loading = ref(true)
const activeTab = ref<'overview' | 'artists' | 'tracks' | 'playlists'>('overview')

onMounted(async () => {
  try {
    const [profileRes, playlistRes] = await Promise.all([
      getTasteProfile(),
      getTastePlaylists(),
    ])
    if (profileRes.code === 0) taste.value = profileRes.data
    if (playlistRes.code === 0) playlists.value = playlistRes.data
  } catch {} finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="taste">
    <div class="taste-header">
      <span class="taste-label">品味画像</span>
      <p class="taste-title">你的听歌记忆</p>
      <div class="taste-tabs">
        <button
          v-for="tab in [
            { key: 'overview', label: '概览' },
            { key: 'artists', label: '歌手' },
            { key: 'tracks', label: '常听' },
            { key: 'playlists', label: '歌单' },
          ]"
          :key="tab.key"
          class="taste-tab"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key as any"
        >{{ tab.label }}</button>
      </div>
    </div>

    <div v-if="loading" class="taste-loading">正在读取品味...</div>

    <div v-else-if="taste" class="taste-body">
      <!-- Overview -->
      <div v-if="activeTab === 'overview'" class="taste-sections">
        <section class="taste-paper">
          <div class="paper-kicker">MyRadio 记忆</div>
          <p class="paper-copy">
            已读取 {{ playlists.length }} 个歌单。MyRadio 会先理解这些偏好，再决定下一首该怎么接。
          </p>
          <div class="paper-tags">
            <span v-for="s in taste.signatures.slice(0, 4)" :key="s">{{ s }}</span>
          </div>
        </section>

        <section class="taste-section">
          <div class="section-title">听感标签</div>
          <div class="tag-list">
            <span v-for="s in taste.signatures" :key="s" class="tag tag-signal">{{ s }}</span>
          </div>
        </section>

        <section class="taste-section">
          <div class="section-title">偏好风格</div>
          <div class="tag-list">
            <span v-for="g in taste.favoriteGenres" :key="g" class="tag">{{ g }}</span>
          </div>
        </section>

        <section class="taste-section">
          <div class="section-title">按时间</div>
          <div class="meta-grid">
            <div v-for="(tags, period) in taste.byTimeOfDay" :key="period" class="meta-row">
              <span class="meta-key">{{ period }}</span>
              <span class="meta-val">{{ tags.join(' / ') }}</span>
            </div>
          </div>
        </section>

        <section class="taste-section">
          <div class="section-title">按心情</div>
          <div class="meta-grid">
            <div v-for="(tags, mood) in taste.byMood" :key="mood" class="meta-row">
              <span class="meta-key">{{ mood }}</span>
              <span class="meta-val">{{ tags.join(' / ') }}</span>
            </div>
          </div>
        </section>

        <section v-if="taste.doNotPlay.length" class="taste-section">
          <div class="section-title">暂不播放</div>
          <div class="tag-list">
            <span v-for="d in taste.doNotPlay" :key="d" class="tag tag-danger">{{ d }}</span>
          </div>
        </section>
      </div>

      <!-- Artists -->
      <div v-else-if="activeTab === 'artists'" class="taste-sections">
        <section class="taste-section">
          <div class="section-title">常听歌手</div>
          <div class="rank-list">
            <div v-for="(a, i) in taste.favoriteArtists" :key="i" class="rank-row">
              <span class="rank-num">{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="rank-name">{{ a.name }}</span>
              <span class="rank-count">{{ a.count || a.likedCount || 0 }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Top Tracks -->
      <div v-else-if="activeTab === 'tracks'" class="taste-sections">
        <section class="taste-section">
          <div class="section-title">长期常听</div>
          <div class="rank-list">
            <div v-for="(t, i) in taste.lifelongTop" :key="i" class="rank-row">
              <span class="rank-num">{{ String(i + 1).padStart(2, '0') }}</span>
              <div class="rank-info">
                <span class="rank-name">{{ t.title }}</span>
                <span class="rank-sub">{{ t.artist }}</span>
              </div>
              <span v-if="t.year" class="rank-count">{{ t.year }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- Playlists -->
      <div v-else-if="activeTab === 'playlists'" class="taste-sections">
        <section class="taste-section">
          <div class="section-title">歌单来源</div>
          <div class="rank-list">
            <div v-for="p in playlists" :key="p.id" class="rank-row">
              <span class="rank-name">{{ p.playlist_name }}</span>
              <span class="rank-count">{{ p.track_count }}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.taste {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--text-primary);
}

.taste-header {
  padding: 4px 16px 10px;
  border-bottom: 0;
}

.taste-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: rgba(216, 181, 106, 0.76);
  letter-spacing: 1.6px;
  display: block;
  text-transform: uppercase;
}

.taste-title {
  margin: 2px 0 9px;
  font-family: var(--font-body);
  font-size: 17px;
  font-weight: 760;
  color: rgba(244, 239, 228, 0.92);
}

.taste-tabs {
  display: flex;
  gap: 3px;
}

.taste-tab {
  padding: 4px 9px;
  background: rgba(244, 239, 228, 0.026);
  border: 1px solid rgba(244, 239, 228, 0.055);
  border-radius: 16px;
  color: rgba(241, 233, 216, 0.42);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 760;
  letter-spacing: 0;
  cursor: pointer;
  transition: all 0.15s;
}

.taste-tab:hover { color: var(--text-2); }

.taste-tab.active {
  background: rgba(77, 216, 141, 0.1);
  border-color: rgba(77, 216, 141, 0.16);
  color: rgba(143, 238, 180, 0.88);
}

.taste-loading {
  padding: 40px 16px;
  text-align: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.taste-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px 12px;
}

.taste-body::-webkit-scrollbar { width: 2px; }
.taste-body::-webkit-scrollbar-thumb { background: var(--line-m); }

.taste-section {
  margin-bottom: 16px;
}

.taste-paper {
  margin: 0 0 14px;
  padding: 14px 14px 13px;
  border-radius: 10px;
  border: 1px solid rgba(244, 239, 228, 0.075);
  background:
    radial-gradient(circle at 14% 14%, rgba(216, 181, 106, 0.1), transparent 36%),
    linear-gradient(180deg, rgba(244, 239, 228, 0.05), rgba(244, 239, 228, 0.018));
  box-shadow: inset 0 1px 0 rgba(244, 239, 228, 0.035);
}

.paper-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 1.4px;
  color: rgba(77, 216, 141, 0.74);
}

.paper-copy {
  margin: 7px 0 0;
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.65;
  color: rgba(241, 233, 216, 0.58);
}

.paper-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}

.paper-tags span {
  padding: 2px 7px;
  border: 1px solid rgba(244, 239, 228, 0.08);
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: rgba(241, 233, 216, 0.62);
  background: rgba(244, 239, 228, 0.035);
}

.section-title {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
  letter-spacing: 1px;
  margin-bottom: 6px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  padding: 2px 8px;
  background: rgba(244, 239, 228, 0.035);
  border: 1px solid rgba(244, 239, 228, 0.065);
  color: rgba(241, 233, 216, 0.62);
  font-family: var(--font-body);
  font-size: 12px;
  font-weight: 650;
  border-radius: 999px;
}

.tag-signal {
  border-color: rgba(77, 216, 141, 0.16);
  color: rgba(143, 238, 180, 0.88);
  background: rgba(77, 216, 141, 0.09);
}

.tag-danger {
  border-color: rgba(216, 92, 74, 0.3);
  color: var(--danger);
}

.meta-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 5px 0;
  border-bottom: 1px solid rgba(244, 239, 228, 0.035);
}

.meta-key {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--warm);
  min-width: 80px;
  flex-shrink: 0;
}

.meta-val {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-2);
}

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px;
  border-radius: 8px;
  background: rgba(244, 239, 228, 0.024);
  border: 1px solid rgba(244, 239, 228, 0.045);
}

.rank-num {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
  min-width: 20px;
  font-variant-numeric: tabular-nums;
}

.rank-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rank-name {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 700;
  color: rgba(244, 239, 228, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-sub {
  font-family: var(--font-body);
  font-size: 12px;
  color: rgba(241, 233, 216, 0.42);
}

.rank-count {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-3);
}
</style>
