/**
 * 单词书封面。
 *
 * `books.coverUrl` 可能为 null（后台未配图），此时回退到一个
 * **按 bookId 稳定取色**的色块 + 首字母，
 * 而不是渲染"暂无封面"的占位图（项目规范：空数据不展示占位）。
 */

export function BookCover({
  bookId,
  title,
  coverUrl,
  size = 48,
  className = '',
}: {
  bookId: string;
  title: string;
  coverUrl: string | null;
  /** 边长（px），同时作用于宽高 */
  size?: number;
  className?: string;
}) {
  const radius = Math.round(size * 0.25);

  if (coverUrl) {
    return (
      // 封面是后台配置的外部 URL（可能是 Supabase Storage），
      // 且只有 40~64px，next/image 的优化收益不抵 remotePatterns 配置成本。
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt={`${title} 封面`}
        width={size}
        height={size}
        className={`shrink-0 object-cover ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  // 从 bookId 派生稳定色相，保证同一本书每次渲染颜色一致（SSR/CSR 必须相同）
  let hue = 0;
  for (let i = 0; i < bookId.length; i++) {
    hue = (hue * 31 + bookId.charCodeAt(i)) % 360;
  }

  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 select-none items-center justify-center font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, hsl(${hue} 62% 58%), hsl(${
          (hue + 38) % 360
        } 58% 44%))`,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {title.trim().charAt(0) || '书'}
    </div>
  );
}
