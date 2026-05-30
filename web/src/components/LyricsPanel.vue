<script setup lang="ts">
import { computed } from 'vue'
import { parseLrc, resolveActiveLyricIndex } from '../utils/lyrics'

const props = defineProps<{
  lyrics: string
  currentTime: number
}>()

// 解析 LRC 格式
const parsedLyrics = computed(() => parseLrc(props.lyrics))

// 当前高亮行索引
const activeIndex = computed(() => {
  return resolveActiveLyricIndex(parsedLyrics.value, props.currentTime)
})

// 固定展示窗口，避免通过 scrollIntoView 造成歌词区域视觉跳动。
const visibleLines = computed(() => {
  const lines = parsedLyrics.value
  if (!lines.length) return []

  const active = activeIndex.value < 0 ? 0 : activeIndex.value
  const start = Math.min(Math.max(active - 2, 0), Math.max(lines.length - 5, 0))
  const windowLines = lines.slice(start, start + 5).map((line, offset) => ({
    key: `${start + offset}-${line.time}`,
    index: start + offset,
    text: line.text,
  }))

  while (windowLines.length < 5) {
    windowLines.push({
      key: `placeholder-${windowLines.length}`,
      index: -1,
      text: '',
    })
  }

  return windowLines
})
</script>

<template>
  <div class="lyrics-panel">
    <div v-if="!parsedLyrics.length" class="lyrics-empty">
      <span class="lyrics-empty-text">LYRICS LOADING</span>
    </div>
    <div v-else class="lyrics-window">
      <div
        v-for="line in visibleLines"
        :key="line.key"
        class="lyric-line"
        :class="{ active: line.index === activeIndex, past: line.index >= 0 && line.index < activeIndex }"
      >
        {{ line.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyrics-panel {
  width: 100%;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  padding: 0;
}

.lyrics-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 210px;
}

.lyrics-empty-text {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  color: rgba(241, 233, 216, 0.42);
  letter-spacing: 2px;
}

.lyrics-window {
  height: 100%;
  display: grid;
  grid-template-rows: repeat(5, 1fr);
  align-items: center;
  overflow: hidden;
}

.lyric-line {
  height: 36px;
  min-height: 0;
  padding: 0 16px;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  color: rgba(241, 233, 216, 0.28);
  text-align: center;
  line-height: 36px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  overflow-wrap: anywhere;
  transition: color 0.28s ease, opacity 0.28s ease;
}

.lyric-line.past {
  opacity: 0.34;
}

.lyric-line.active {
  color: rgba(241, 233, 216, 0.92);
  font-size: 14px;
  font-weight: 760;
  text-shadow: 0 0 18px rgba(216, 181, 106, 0.2);
}
</style>
