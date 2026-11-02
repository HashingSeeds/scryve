import config from "./goldie.config.ts"

// why: published goldie rejects the iPhone Duo device keys, so Duo captures run from the
// mchisolm0/goldie fork (feat/iphone-duo) with this config:
//   GOLDIE_CONFIG=goldie/goldie.duo.config.ts bun ~/oss/goldie/src/cli.ts capture
export default {
  ...config,
  devices: ["iphone-duo-outer", "iphone-duo-inner"],
}
