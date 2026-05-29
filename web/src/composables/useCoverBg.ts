import { ref, watch, computed } from 'vue'
import { usePlayerStore } from '../stores/player'

/**
 * 封面背景 composable
 * 监听当前歌曲封面，返回可用于 CSS background-image 的样式
 */
export function useCoverBg() {
  const store = usePlayerStore()
  const bgUrl = ref('')

  watch(() => store.currentTrack?.coverUrl, (url) => {
    if (url) bgUrl.value = url
  }, { immediate: true })

  const bgStyle = computed(() => ({
    backgroundImage: bgUrl.value ? `url(${bgUrl.value})` : 'none',
  }))

  return { bgUrl, bgStyle }
}
