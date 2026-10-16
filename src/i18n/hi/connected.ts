// why: `pnpm i18n:translate` overwrites this file. Edit English in src/i18n/en.
import type { LocaleNamespace } from "../localeNamespace"

export default {
  relativeTime: {
    justNow: "अभी-अभी",
    minutes: "{{minutes}} मिनट पहले",
    hours: "{{hours}} घंटे पहले",
    days: "{{days}} दिन पहले",
  },
  resumeTitle: {
    hostingLobby: "होस्ट · शुरू होने की प्रतीक्षा",
    hostingActive: "होस्ट · जारी है",
    playingLobby: "खेल रहे हैं · शुरू होने की प्रतीक्षा",
    playingActive: "खेल रहे हैं · जारी है",
  },
  seatCount_one: "{{count}} सीट",
  seatCount_other: "{{count}} सीटें",
  allSeatsClaimed: "सभी सीटें ली जा चुकी हैं",
  waitingForPlayers_one: "{{count}} और खिलाड़ी का इंतज़ार",
  waitingForPlayers_other: "{{count}} और खिलाड़ियों का इंतज़ार",
  decksRequired: "डेक ज़रूरी हैं",
  decksOptional: "डेक वैकल्पिक हैं",
  yourSeat: "आपकी सीट",
  seatNumber: "सीट {{seat}}",
  noDeckSelected: "कोई डेक चुना नहीं गया",
  lobbyExit: {
    abandon: {
      title: "यह लॉबी छोड़ दें?",
      message:
        "इससे सभी के लिए लॉबी बंद हो जाएगी और अंतिम सारांश सहेजा जाएगा। इसे पूर्ववत नहीं किया जा सकता।",
      confirmText: "लॉबी छोड़ें",
    },
    leave: {
      title: "यह लॉबी छोड़ें?",
      message:
        "लॉबी आपकी फिर शुरू करने की सूची से हट जाएगी। अन्य खिलाड़ी और उनका इतिहास जैसा है वैसा रहेगा।",
      confirmText: "लॉबी से बाहर निकलें",
    },
  },
  onlineOnly: {
    start:
      "गेम शुरू करने के लिए दोबारा कनेक्ट करें। शुरू करना केवल ऑनलाइन होता है और कतार में नहीं रखा जाता।",
    exit: "इस लॉबी से बाहर निकलने या इसे छोड़ने के लिए दोबारा कनेक्ट करें। ये कार्रवाइयाँ केवल ऑनलाइन होती हैं और कतार में नहीं रखी जातीं।",
    join: "सीट लेने के लिए दोबारा कनेक्ट करें। सीट लेना केवल ऑनलाइन होता है और कतार में नहीं रखा जाता।",
    deck: "डेक बदलने के लिए दोबारा कनेक्ट करें। डेक का चयन केवल ऑनलाइन होता है और कतार में नहीं रखा जाता।",
  },
} satisfies LocaleNamespace
