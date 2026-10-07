/**
 * 单词发音按钮（client component）。
 *
 * 有道发音接口：
 *   https://dict.youdao.com/dictvoice?audio={word}&type={1|2}
 *   - type=1 → 英音（British English）
 *   - type=2 → 美音（American English）
 *
 * 用 `<audio>` 元素 + `Audio(url).play()` 播放；同一时刻只允许一个
 * 按钮处于播放态（避免同一单词的 US/UK 双击串音）。
 *
 * ## 设计细节
 *
 * 1. **静音兜底**：有道接口偶发返回 `text/plain` 或 404（生僻词、
 *    网络抖动），`onError` 把按钮置为不可用态，**不弹 toast** —
 *    跟项目其它"失败就静默 + 兜底"的约定一致（参考 word-card 的
 *    setError 兜底）。
 * 2. **同组件互斥播放**：每个实例自带 ref，组件内点 US 时若 UK 正在
 *    播，就先停 UK 再播 US。组件间不做全局去重，因为跨单词切换
 *    通常是用户主动行为；同时只播一个的体验更好。
 * 3. **音频元素挂在 window**：React 19 起 audio 元素不能放在
 *    已卸载的组件里继续播放，会抛 `The media resource indicated
 *    by the src attribute or assigned media provider object was not
 *    suitable`。改挂 `window` 不合适（污染全局）。最终方案是用
 *    Audio() 构造函数，每次点击建一个新实例、用完 `pause() + null
 *  src` 清理。`audioRef.current.src = ''` 再点击同一按钮不会重新
 *    请求，所以每点都新建。
 * 4. **URL encode**：单词可能含空格、撇号（如 "it's"）、`&`，
 *    必须 `encodeURIComponent`。
 *
 * ## 「小喇叭」icon
 *
 * 用 lucide 风格的内联 SVG，避免引入新依赖。三态：idle（灰）、
 * loading（脉冲）、playing（高亮 + 微旋转）、unavailable（淡灰）。
 */
'use client';

import { useEffect, useRef, useState } from 'react';

export type PronunciationAccent = 'us' | 'uk';

const YOUDAO_BASE = 'https://dict.youdao.com/dictvoice';

/**
 * 拼出有道发音接口的最终 URL。
 * 单独抽函数，方便测试与日后换接口。
 */
export function youdaoVoiceUrl(word: string, accent: PronunciationAccent): string {
  // type=1 英音(type=uk)，type=2 美音(type=us)
  const type = accent === 'uk' ? '1' : '2';
  return `${YOUDAO_BASE}?audio=${encodeURIComponent(word)}&type=${type}`;
}

type Status = 'idle' | 'loading' | 'playing' | 'unavailable';

interface Props {
  /** 要发音的单词（headWord 原值，不要先 trim 太狠以免破坏词形） */
  word: string;
  /** 美 / 英 */
  accent: PronunciationAccent;
/**
 * 视觉变体：
 *   - chip → 详情页用，`slabel === 'chip'` 字号偏小、字色不施加细线
 *   - icon → 不变（保留字眼标签用于变化），学习页用，字紧 + 样式略放大
 *
 * 两种变体都带 "US"/"UK" 文字，保证用户不需要 hover title
 * 也能一眼分出英美。
 */
variant?: 'chip' | 'icon';
  /** chip 模式：美 / 英 标签文字，默认自动（US / UK） */
  label?: string;
  className?: string;
  /** 按钮触底尺寸（Tailwind 类），默认 36px 方形 */
  sizeClass?: string;
}

export function PronunciationButton({
  word,
  accent,
  variant = 'chip',
  label,
  className,
  sizeClass = 'h-9 px-3 text-xs',
}: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 卸载时清理
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        a.pause();
        a.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  // 没有 word 直接禁用（不可点击），但仍渲染成可见的"音标标签"，
  // 这样学习页如果整列卡片都缺 headWord 也至少能看到 US/UK 文字。
  const fallbackLabel = label ?? (accent === 'us' ? 'US' : 'UK');
  if (!word) {
    return (
      <span
        className={[
          'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 text-slate-300',
          sizeClass,
          className ?? '',
        ].join(' ')}
        aria-disabled
      >
        <SpeakerIcon className="h-3 w-3" />
        {fallbackLabel}
      </span>
    );
  }

  function handlePlay() {
    // 状态机：
    //   idle      → 进 loading，等 <audio> canplaythrough → playing
    //   loading   → 用户连点：先停掉旧 audio，从头再来
    //   playing   → 再点 = 暂停（toggle）
    //   unavailable → 永久禁用，点了也不响应
    if (status === 'unavailable') return;

    const prev = audioRef.current;
    if (prev) {
      prev.pause();
      prev.src = '';
    }

    const audio = new Audio(youdaoVoiceUrl(word, accent));
    audioRef.current = audio;
    setStatus('loading');

    audio.oncanplaythrough = () => {
      // onCanplayThrough 事件触发时，audio 可能已经被卸载或换了 src，
      // 此时再 setStatus 会写到"过期实例"上。用 ref 闭包外层的 audio
      // 与当前的 audioRef 对比，命中再写。
      if (audioRef.current === audio) {
        void audio
          .play()
          .then(() => {
            if (audioRef.current === audio) setStatus('playing');
          })
          .catch(() => {
            // autoplay 策略 / 网络断 → 静默回到 idle，不弹错误
            if (audioRef.current === audio) setStatus('idle');
          });
      }
    };

    audio.onended = () => {
      if (audioRef.current === audio) setStatus('idle');
    };

    audio.onerror = () => {
      if (audioRef.current === audio) setStatus('unavailable');
    };
  }

  const disabled = status === 'unavailable';
  const isActive = status === 'loading' || status === 'playing';
  // icon 变体比 chip 略大一点（学习页紧凑 chip 给 3.5，详情页 chip 给 3）
  const iconClass = variant === 'icon' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  const buttonText = label ?? (accent === 'us' ? 'US' : 'UK');

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={disabled}
      aria-label={accent === 'us' ? '播放美音' : '播放英音'}
      title={
        disabled
          ? '发音暂不可用'
          : accent === 'us'
            ? '点击播放美音'
            : '点击播放英音'
      }
      className={[
        'inline-flex items-center gap-1 rounded-full border transition-colors',
        sizeClass,
        disabled
          ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
          : isActive
            ? 'border-brand-200 bg-brand-50 font-medium text-brand-600'
            : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 active:bg-brand-100',
        className ?? '',
      ].join(' ')}
    >
      <SpeakerIcon
        className={`${iconClass} ${isActive ? 'animate-pulse-speak' : ''}`}
      />
      <span>{buttonText}</span>
    </button>
  );
}

/** lucide `volume-2` 风格的小喇叭（无外部依赖） */
function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}