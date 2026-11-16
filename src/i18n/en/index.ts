import account from "./account"
import board from "./board"
import common from "./common"
import connected from "./connected"
import decks from "./decks"
import errors from "./errors"
import eventDisplay from "./eventDisplay"
import events from "./events"
import feedback from "./feedback"
import permissions from "./permissions"
import play from "./play"
import systems from "./systems"

const en = {
  account,
  board,
  common,
  connected,
  decks,
  errors,
  eventDisplay,
  events,
  feedback,
  permissions,
  play,
  systems,
}

export default en
export type Translations = typeof en
