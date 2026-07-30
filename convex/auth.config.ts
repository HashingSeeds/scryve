import type { AuthConfig } from "convex/server"

import { validateClerkIssuerDomain } from "./lib/authConfig"

export default {
  providers: [
    {
      domain: validateClerkIssuerDomain(process.env.CLERK_JWT_ISSUER_DOMAIN),
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig
