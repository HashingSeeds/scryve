// iOS shows these under its own permission request: the reason Scryve asks. Full sentences.
const permissions = {
  // The camera also reads the name printed on a physical game card, to look the card up.
  camera: "Scan Scryve game invitation QR codes and read card names. Photos stay on this device.",
  photos: "Allow Scryve to attach a screenshot you choose to a support request.",
  // The player finds and joins the games; address the player directly.
  // ar: Use exactly: يستخدم تطبيق Scryve شبكتك المحلية للعثور على المباريات على الأجهزة القريبة والانضمام إليها.
  localNetwork: "Scryve uses your local network to find and join games on nearby devices.",
}

export default permissions
