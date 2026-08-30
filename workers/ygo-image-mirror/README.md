# Yu-Gi-Oh image mirror

This Worker keeps YGOPRODeck card images in a private R2 bucket and serves them through Scryve's domain. Anonymous requests can read existing images but cannot populate the bucket. The authenticated sync fetches YGOPRODeck card data once, then asks the Worker to mirror one missing printing ID per request.

## Production resources

- Worker: `scryve-ygo-image-mirror`
- R2 bucket: `scryve-ygo-images`
- Domain: `https://ygo-images.scryve.sow.care`
- GitHub environment: `ygo-image-mirror-production`

The R2 bucket stays private. The Worker is the only public image origin.

Production has a 10 ms CPU limit per request. Keep mirror requests to one image and avoid hashing image bodies inside the Worker. R2 supplies object ETags; the Worker separately bounds the response size and verifies JPEG magic bytes before storage.

## Checks

```sh
pnpm check:ygo-worker
```

This runs TypeScript checks, Jest tests, Workers-runtime tests, generated-type validation, and preview and production bundle dry runs.

To inspect the live provider response without writing images:

```sh
YGO_MIRROR_BASE_URL=https://ygo-images.scryve.sow.care \
  pnpm sync:ygo-images -- --dry-run
```

## GitHub configuration

The `ygo-image-mirror-production` environment needs:

- Secret `CLOUDFLARE_API_TOKEN`
- Secret `YGO_MIRROR_TOKEN`
- Variable `CLOUDFLARE_ACCOUNT_ID`
- Variable `CLOUDFLARE_ZONE_ID`

The Cloudflare API token should be limited to the Scryve account and `sow.care` zone. It needs Workers Scripts Write, Workers R2 Storage Write, Workers Routes Write, Zone Read, and Cache Purge.

Repository variable `YGO_IMAGE_SYNC_ENABLED` controls the weekly sync. Keep it `false` until the custom domain is healthy and the first manual sync succeeds.

## Operations

Use the manual `deploy Yu-Gi-Oh image mirror` workflow for production deployments. Use `sync Yu-Gi-Oh images` for a dry run, limited seed, or full seed. The weekly schedule is idempotent because the Worker checks R2 before downloading an image.

Use `remove Yu-Gi-Oh image` for a takedown. It deletes the R2 object and purges the exact URL from Cloudflare's CDN. A browser that already cached the image can retain it for at most one hour.
