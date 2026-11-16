// why: `pnpm i18n:translate` overwrites this file. Fix wording in src/i18n/en or src/i18n/glossary.json.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  camera:
    "Scryve 게임 초대 QR 코드를 스캔하고 카드 이름을 인식합니다. 사진은 이 기기에만 저장됩니다.",
  photos: "선택한 스크린샷을 지원 요청에 첨부할 수 있도록 Scryve에 허용합니다.",
  localNetwork: "Scryve는 로컬 네트워크를 사용하여 근처 기기에서 진행 중인 게임을 찾고 참가합니다.",
} satisfies LocaleNamespace
