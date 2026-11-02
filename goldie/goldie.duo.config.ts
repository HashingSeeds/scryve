import config from "./goldie.config.ts"

// why: published goldie rejects the iPhone Duo device keys, so Duo captures, and a studio that
// shows every device, run from the mchisolm0/goldie fork (feat/iphone-duo) with this config:
//   GOLDIE_CONFIG=goldie/goldie.duo.config.ts bun ~/oss/goldie/src/cli.ts capture --device iphone-duo-outer
export default {
  ...config,
  devices: [...config.devices, "iphone-duo-outer", "iphone-duo-inner"],
}
