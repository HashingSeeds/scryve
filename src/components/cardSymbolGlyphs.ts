// why: generated with assets/fonts/CardSymbols.ttf by scripts/card-symbols-font.py, so hand edits drift from the font.

export const CARD_SYMBOL_FONT = "CardSymbols"

/** why: every other glyph has no advance so a symbol's layers stack; this one moves the pen past them. */
export const SYMBOL_ADVANCE = "\uE000"

export const SYMBOL_LAYERS = {
  disc: "\uE001",
  ring: "\uE002",
  discUpper: "\uE003",
  discLower: "\uE004",
  phyrexianDot: "\uE005",
  phyrexianHeart: "\uE006",
} as const

export const COIN_FACES = {
  "sun": { whole: "\uE007", upper: "\uE008", lower: "\uE009" },
  "waves": { whole: "\uE00A", upper: "\uE00B", lower: "\uE00C" },
  "skull": { whole: "\uE00D", upper: "\uE00E", lower: "\uE00F" },
  "flame": { whole: "\uE010", upper: "\uE011", lower: "\uE012" },
  "leaf": { whole: "\uE013", upper: "\uE014", lower: "\uE015" },
  "diamond": { whole: "\uE016", upper: "\uE017", lower: "\uE018" },
  "redo": { whole: "\uE019", upper: "\uE01A", lower: "\uE01B" },
  "undo": { whole: "\uE01C", upper: "\uE01D", lower: "\uE01E" },
  "zap": { whole: "\uE01F", upper: "\uE020", lower: "\uE021" },
  "snowflake": { whole: "\uE022", upper: "\uE023", lower: "\uE024" },
  "brain": { whole: "\uE025", upper: "\uE026", lower: "\uE027" },
  "shield": { whole: "\uE028", upper: "\uE029", lower: "\uE02A" },
  "0": { whole: "\uE02B", upper: "\uE02C", lower: "\uE02D" },
  "1": { whole: "\uE02E", upper: "\uE02F", lower: "\uE030" },
  "2": { whole: "\uE031", upper: "\uE032", lower: "\uE033" },
  "3": { whole: "\uE034", upper: "\uE035", lower: "\uE036" },
  "4": { whole: "\uE037", upper: "\uE038", lower: "\uE039" },
  "5": { whole: "\uE03A", upper: "\uE03B", lower: "\uE03C" },
  "6": { whole: "\uE03D", upper: "\uE03E", lower: "\uE03F" },
  "7": { whole: "\uE040", upper: "\uE041", lower: "\uE042" },
  "8": { whole: "\uE043", upper: "\uE044", lower: "\uE045" },
  "9": { whole: "\uE046", upper: "\uE047", lower: "\uE048" },
  "10": { whole: "\uE049", upper: "\uE04A", lower: "\uE04B" },
  "11": { whole: "\uE04C", upper: "\uE04D", lower: "\uE04E" },
  "12": { whole: "\uE04F", upper: "\uE050", lower: "\uE051" },
  "13": { whole: "\uE052", upper: "\uE053", lower: "\uE054" },
  "14": { whole: "\uE055", upper: "\uE056", lower: "\uE057" },
  "15": { whole: "\uE058", upper: "\uE059", lower: "\uE05A" },
  "16": { whole: "\uE05B", upper: "\uE05C", lower: "\uE05D" },
  "17": { whole: "\uE05E", upper: "\uE05F", lower: "\uE060" },
  "18": { whole: "\uE061", upper: "\uE062", lower: "\uE063" },
  "19": { whole: "\uE064", upper: "\uE065", lower: "\uE066" },
  "20": { whole: "\uE067", upper: "\uE068", lower: "\uE069" },
  "X": { whole: "\uE06A", upper: "\uE06B", lower: "\uE06C" },
  "Y": { whole: "\uE06D", upper: "\uE06E", lower: "\uE06F" },
  "Z": { whole: "\uE070", upper: "\uE071", lower: "\uE072" },
} as const

export const LINE_SYMBOLS = {
  sword: "\uE073",
  shield: "\uE074",
  heart: "\uE075",
  wind: "\uE076",
  brain: "\uE077",
  redo: "\uE078",
  undo: "\uE079",
  hexagonR: "\uE07A",
  hexagonX: "\uE07B",
} as const
