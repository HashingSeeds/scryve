import { spawnSync } from "node:child_process"
import path from "node:path"

it("generates the scene lifecycle required to launch on iOS 27", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "node_modules/expo/bin/cli"),
      "config",
      "--type",
      "introspect",
      "--json",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, APP_VARIANT: "production", EXPO_NO_DOTENV: "1" },
    },
  )

  expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: "" })
  const config = JSON.parse(result.stdout)
  expect(config._internal.modResults.ios.infoPlist.UIApplicationSceneManifest).toEqual({
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: "Default Configuration",
          UISceneDelegateClassName: "EXExpoAppSceneDelegate",
        },
      ],
    },
  })
})
