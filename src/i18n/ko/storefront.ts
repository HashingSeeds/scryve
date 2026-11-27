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
  screenshots: {
    connected: {
      headline: "로컬 또는 연결",
      subhead: "내 폰에서 시작, 코드로 연결",
    },
    tenPlayers: {
      headline: "최대 {{maxPlayers}}명",
      subhead: "모든 자리가 플레이어를 향합니다",
    },
    commanderDamage: {
      headline: "커맨더 피해",
      subhead: "상대별로 카드에 따로 기록",
    },
    twoHeadedGiant: {
      headline: "쌍두거인",
      subhead: "팀원끼리 생명점 공유",
    },
    chessClock: {
      headline: "턴과 체스 시계",
      subhead: "탭 한 번에 턴과 시계 넘기기",
    },
    bestOf: {
      headline: "3판 승부",
      subhead: "게임 승수 합산, 라운드 타이머 지원",
    },
    pokemon: {
      headline: "카드별 HP",
      subhead: "배틀 포켓몬 선택, HP는 앞에",
    },
    rules: {
      headline: "테이블 위의 룰",
      subhead: "게임 중 공식 룰 검색",
    },
    decks: {
      headline: "덱별 승률",
      subhead: "모든 게임이 덱 기록에 반영",
    },
    history: {
      headline: "모든 게임 저장",
      subhead: "로컬·연결 게임을 한곳에",
    },
  },
  listing: {
    appStoreName: "Scryve: 카드 게임 생명점 기록",
    playTitle: "Scryve: 카드 게임 생명점 카운터",
    subtitle: "카운터 · 덱 · 통계 · 대회",
    shortDescription: "TCG와 커맨더용 생명점 카운터. 덱 통계와 대회 기능까지 한 번에.",
    gameName: {
      mtg: "매직: 더 개더링",
      ygo: "유희왕",
      pokemon: "포켓몬 카드 게임",
      lorcana: "디즈니 로카나",
      fab: "플레시 앤드 블러드",
      riftbound: "리프트바운드",
    },
    description: {
      players:
        "최대 {{maxPlayers}}명까지 지원하는 생명점 카운터로, 커맨더(EDH)의 커맨더 피해와 포켓몬의 데미지 카운터도 사용할 수 있습니다.",
      play: "휴대폰 하나를 함께 쓰거나, 같은 Wi-Fi의 휴대폰끼리 연결해 생명점을 공유하거나, 로그인해서 어디서든 플레이하세요.",
      games: "{{games}} 지원.",
      decks: "덱을 저장하고 승률과 매치 기록을 확인하세요.",
      events:
        "휴대폰으로 스위스 라운드나 조 이벤트를 진행하세요. 인터넷이 없는 매장 Wi-Fi에서도 가능합니다. 플레이어는 각자 휴대폰으로 결과를 보고하고, 매장 TV에 대진, 타이머, 순위를 표시할 수 있습니다.",
      noAccount:
        "휴대폰 하나로 하는 게임과 Wi-Fi 게임에는 계정이 필요 없으며, 휴대폰 하나로 하는 게임은 오프라인에서도 작동합니다.",
      proHeading: "Scryve Pro",
      pro: "덱 {{freeDecks}}개 대신 최대 {{proDecks}}개를 동기화하고, 덱마다 최대 {{proVersions}}개 버전을 보관하세요. 버전별 승률을 비교해 변경 효과를 확인하고, 리스트를 나란히 비교할 수 있습니다. 또한 Pro는 공유 게임의 내 자리에 Pro 표시를 달아 주고 Pro 앱 아이콘을 사용할 수 있게 합니다.",
      appleBilling_other:
        "Scryve Pro는 자동 갱신 구독입니다. 구매를 확인하면 Apple 계정으로 결제됩니다. 현재 구독 기간이 끝나기 최소 {{count}}시간 전에 해지하지 않으면 구독이 자동으로 갱신됩니다. Apple 계정 설정에서 구독을 관리하거나 해지하세요.",
      googleBilling:
        "Scryve Pro는 Google Play 계정으로 결제되는 자동 갱신 구독입니다. 해지하기 전까지 자동으로 갱신됩니다. Google Play 구독에서 언제든 관리하거나 해지하세요.",
      eula: "이용약관(EULA): {{url}}",
      terms: "서비스 약관: {{url}}",
      privacy: "개인정보 처리방침: {{url}}",
    },
    whatsNew:
      "• 로그인 없이 휴대폰에서 바로 Pro를 구매하세요.\n• 연결이 끊겨도 Pro가 잠금 해제된 상태로 유지됩니다.\n• 보드의 모서리가 휴대폰의 둥근 화면에 맞춰집니다.\n• 권한 요청 창이 사용자의 언어로 표시됩니다.\n• 더 빨라진 규칙 검색.\n\n그 밖에도 다양한 문제를 수정했습니다.",
  },
} satisfies LocaleNamespace
