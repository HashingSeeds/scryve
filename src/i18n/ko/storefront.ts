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
      "덱\n• 링크로 덱을 공유하세요. 친구는 로컬, 클라우드, 근처 게임에서 바로 플레이하거나 자신의 사본으로 저장할 수 있습니다.\n• 새로운 플레이 및 빌드 화면: 가져갈 버전을 선택하고, 최근 결과를 확인하며, 카드, 사이드보드, 파트너 커맨더를 편집할 수 있습니다.\n• 매치의 게임 사이에 사이드보딩할 수 있습니다.\n• 모든 덱의 통계를 제공하며, Pro에서는 리스트 비교도 가능합니다.\n• 색상별로 덱을 필터링하고 커맨더로 찾을 수 있습니다.\n• 이 기기에는 덱을 제한 없이 보관하고, 동기화할 덱을 선택하세요. 매치는 오프라인에서도 기록할 수 있습니다.\n• 덱을 열지 않고도 카드를 검색할 수 있습니다. 오타가 있어도 검색됩니다.\n\n게임\n• 플레이어를 탭하여 커맨더 피해를 줄 수 있습니다. 파트너 커맨더는 함께 공격합니다.\n• 선공할 사람을 고르세요. 덱 통계에서 선공과 후공 전적을 확인할 수 있습니다.\n• 근처 게임은 누구나 참여할 수 있습니다. 코드나 QR로 참가하세요.\n\n이벤트\n• 휴대폰으로 스위스 라운드나 조 이벤트를 진행하세요. 인터넷이 없는 매장 Wi-Fi에서도 가능합니다. 플레이어는 각자 휴대폰으로 결과를 보고하고, 매장 TV에 대진, 타이머, 순위를 표시할 수 있습니다.\n\n피드백\n• 앱에서 피드백을 보내고 답변을 확인하세요. 알림은 선택 사항입니다.\n\n그 밖에 더 빨라진 근처 플레이와 다양한 수정 사항이 포함되었습니다.",
  },
} satisfies LocaleNamespace
