import account from "./account"
import board from "./board"
import common from "./common"
import connected from "./connected"
import decks from "./decks"
import errors from "./errors"
import events from "./events"
import feedback from "./feedback"
import play from "./play"
import systems from "./systems"

const en = { account, board, common, connected, decks, errors, events, feedback, play, systems }

export default en
export type Translations = typeof en
