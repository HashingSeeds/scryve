// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  paywall: {
    title: "Scryve Pro",
    perks: {
      decks: "덱 최대 {{proDecks}}개 동기화 (무료는 {{freeDecks}}개)",
      versions: "덱별 버전 {{proVersions}}개 보관 (무료는 {{freeVersions}}개)",
      compare: "덱 리스트를 나란히 비교",
      seatMark: "공유 게임에서 내 자리에 Pro 표시",
      appIcons: "Pro 전용 앱 아이콘",
    },
    save: "{{ product.relative_discount }} 할인",
    perMonth: "월 {{ product.price_per_month }}",
    billedAt: "결제 금액: {{ product.price_per_period_abbreviated }}",
    continue: "계속",
    restore: "구매 복원",
    terms: "이용약관",
    privacy: "개인정보 처리방침",
  },
} satisfies LocaleNamespace
