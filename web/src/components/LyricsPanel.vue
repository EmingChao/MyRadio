<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'

const props = defineProps<{
  lyrics: string
  currentTime: number
}>()

interface LyricLine {
  time: number
  text: string
}

const scrollRef = ref<HTMLElement | null>(null)

// 解析 LRC 格式
const parsedLyrics = computed<LyricLine[]>(() => {
  if (!props.lyrics) return []
  const lines: LyricLine[] = []
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/

  for (const rawLine of props.lyrics.split('\n')) {
    const match = rawLine.match(regex)
    if (match) {
      const min = parseInt(match[1], 10)
      const sec = parseInt(match[2], 10)
      const ms = parseInt(match[3], 10)
      const time = min * 60 + sec + ms / (match[3].length === 3 ? 1000 : 100)
      const text = match[4].trim()
      if (text) {
        lines.push({ time, text })
      }
    }
  }
  return lines.sort((a, b) => a.time - b.time)
})

// 当前高亮行索引
const activeIndex = computed(() => {
  const lines = parsedLyrics.value
  if (!lines.length) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (props.currentTime >= lines[i].time) {
      idx = i
    } else {
      break
    }
  }
  return idx
})

// 自动滚动到当前行
watch(activeIndex, async (idx) => {
  if (idx < 0 || !scrollRef.value) return
  await nextTick()
  const activeEl = scrollRef.value.querySelector('.lyric-line.active') as HTMLElement
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})
</script>

<template>
  <div class="lyrics-panel" ref="scrollRef">
    <div v-if="!parsedLyrics.length" class="lyrics-empty">
      <span class="lyrics-empty-text">NO LYRICS</span>
    </div>
    <template v-else>
      <div class="lyrics-spacer" />
      <div
        v-for="(line, i) in parsedLyrics"
        :key="i"
        class="lyric-line"
        :class="{ active: i === activeIndex, past: i < activeIndex }"
      >
        {{ line.text }}
      </div>
      <div class="lyrics-spacer" />
    </template>
  </div>
</template>

<style scoped>
.lyrics-panel {
  max-height: 240px;
  overflow-y: auto;
  padding: 8px 0;
  scroll-behavior: smooth;
}

.lyrics-panel::-webkit-scrollbar {
  width: 3px;
}

.lyrics-panel::-webkit-scrollbar-thumb {
  background: var(--border);
}

.lyrics-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
}

.lyrics-empty-text {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);
  letter-spacing: 2px;
}

.lyrics-spacer {
  height: 100px;
}

.lyric-line {
  padding: 4px 16px;
  font-family: var(--font-pixel);
  font-size: 14px;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.8;
  transition: all 0.3s ease;
}

.lyric-line.past {
  opacity: 0.4;
}

.lyric-line.active {
  color: var(--accent);
  font-size: 16px;
  text-shadow: 0 0 8px var(--accent-glow);
}
</style>
