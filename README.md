# forgetze.com website

Static site: `index.html` (marketing) + `privacy.html` (privacy policy, required
by App Store Connect). No build step, no dependencies.

## Deploy — GitHub Pages (recommended, free)

1. Create a repo `nyandrews/forgetze-site` and push the contents of this
   `website/` folder to its root (the `CNAME` file is already included)
2. Repo → Settings → Pages → Source: `main` branch, `/ (root)`
3. At your domain registrar, add DNS records for forgetze.com:
   - `A` records for the apex: `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`
   - `CNAME` record: `www` → `nyandrews.github.io`
4. Back in Pages settings: set custom domain `forgetze.com`, enable
   **Enforce HTTPS** once the certificate provisions (~15 min)

## App Store Connect URLs (once live)

- Support URL: `https://forgetze.com`
- Privacy Policy URL: `https://forgetze.com/privacy.html`
