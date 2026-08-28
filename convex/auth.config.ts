import type { AuthConfig } from "convex/server"

import { validateClerkIssuerDomain } from "./lib/authConfig"

export default {
  providers: [
    {
      domain: validateClerkIssuerDomain(process.env.CLERK_FRONTEND_API_URL),
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig
