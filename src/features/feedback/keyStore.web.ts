import { loadString, saveString } from "@/utils/storage"

const NAME = "scryve.feedbackKey"

export const keyStore = {
  read: async () => loadString(NAME),
  write: async (value: string) => {
    saveString(NAME, value)
  },
}
