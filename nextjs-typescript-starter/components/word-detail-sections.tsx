/**
 * 单词详情页的各区块（proposal 5.6.2）。
 *
 * ## 渲染顺序（严格对齐需求，不可调整）
 *   释义 → 例句 → 短语 → 近义词 → 同根词
 *
 * ## 空字段整块不渲染
 *
 * 每个区块都用 `length > 0` 包裹。需求与项目规范都强调
 * "空数据整块不渲染，避免『暂无数据』占位"（design.md 8.6）。
 */
import { posLabel, type ParsedWord } from '@/lib/word-content';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-100 px-5 py-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function WordDetailSections({ word }: { word: ParsedWord }) {
  return (
    <div className="pb-10">
      {/* 释义 */}
      {word.trans.length > 0 ? (
        <Section title="释义">
          <ul className="space-y-2.5">
            {word.trans.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                <div>
                  <p className="text-[15px] text-slate-800">{t.tranCn}</p>
                  {t.tranOther ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                      {t.tranOther}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 例句 */}
      {word.sentences.length > 0 ? (
        <Section title="例句">
          <ul className="space-y-3.5">
            {word.sentences.map((s, i) => (
              <li key={i}>
                <p className="text-[15px] leading-relaxed text-slate-800">
                  {s.sContent}
                </p>
                {s.sCn ? (
                  <p className="mt-0.5 text-sm leading-relaxed text-slate-500">
                    {s.sCn}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 短语 */}
      {word.phrases.length > 0 ? (
        <Section title="短语">
          <ul className="space-y-2.5">
            {word.phrases.map((p, i) => (
              <li key={i}>
                <p className="text-[15px] text-slate-800">{p.pContent}</p>
                {p.pCn ? (
                  <p className="mt-0.5 text-sm text-slate-500">{p.pCn}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 近义词 —— 数据来自 syno.hwds[].w，已被 parseWordContent 拍平成 string[] */}
      {word.synos.length > 0 ? (
        <Section title="近义词">
          <ul className="space-y-3">
            {word.synos.map((s, i) => (
              <li key={i}>
                {s.pos ? (
                  <span className="mb-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
                    {posLabel(s.pos)}
                  </span>
                ) : null}
                <p className="text-[15px] leading-relaxed text-slate-800">
                  {s.words.join(' / ')}
                </p>
                {s.tran ? (
                  <p className="mt-0.5 text-sm text-slate-500">{s.tran}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 同根词 —— 数据来自 relWord.words[].hwd + .tran，字段名与近义词不同 */}
      {word.relWords.length > 0 ? (
        <Section title="同根词">
          <ul className="space-y-2.5">
            {word.relWords.map((r, i) => (
              <li key={i}>
                <div className="flex gap-2">
                  {r.pos ? (
                    <span className="mt-1 w-10 shrink-0 text-[11px] text-slate-400">
                      {posLabel(r.pos)}
                    </span>
                  ) : null}
                  <div className="min-w-0">
                    {r.words.map((w, j) => (
                      <p key={j} className="text-[15px] leading-relaxed">
                        <span className="text-slate-800">{w.hwd}</span>
                        {w.tran ? (
                          <span className="ml-2 text-sm text-slate-500">
                            {w.tran}
                          </span>
                        ) : null}
                      </p>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
