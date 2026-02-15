# Golang4U — Future Improvements & Setup Guide

> Reference document for improvements to enable when you're ready.
> Each section includes the exact config changes needed in `config.toml`.

---

## 🌐 Social Media Links

When you create social accounts, add the usernames to `[params.social]` in `config.toml`.
Each link will appear on your homepage profile and footer.

```toml
[params.social]
  GitHub = "YourGitHubUsername"
  Linkedin = "your-linkedin-id"        # from linkedin.com/in/your-linkedin-id
  Twitter = "YourTwitterHandle"         # without the @
  Instagram = "YourInstagramHandle"
  Facebook = ""
  Telegram = ""
  Medium = ""
  Reddit = ""
  Mastodon = ""
  Devto = ""                            # dev.to username
  Youtube = ""                          # channel name or ID
  Stackoverflow = ""                    # user ID number
  Discord = ""
```

**Already configured:**
- ✅ `BuyMeACoffee = "punitn"`
- ✅ Author website: `https://punitnaran.com` (in `[params.author]`)

---

## 📊 Analytics

Choose ONE provider and add your credentials. Recommended: **Google Analytics** or **Plausible** (privacy-friendly).

### Option A: Google Analytics
```toml
[params.analytics]
  enable = true
  [params.analytics.google]
    id = "G-XXXXXXXXXX"     # Your GA4 Measurement ID
    anonymizeIP = true
```

### Option B: Plausible (Privacy-First)
```toml
[params.analytics]
  enable = true
  [params.analytics.plausible]
    data_domain = "golang4u.com"
    src = "https://plausible.io/js/script.js"
```

### Option C: Cloudflare Analytics (Free, No Cookie Banner Needed)
```toml
[params.analytics]
  enable = true
  [params.analytics.cloudflare]
    token = "your-beacon-token"
```

---

## 💬 Comments System

Enable ONE comment provider on blog posts. Recommended: **Giscus** (GitHub-powered, free).

### Giscus Setup (Recommended)
1. Go to https://giscus.app
2. Enter repo: `PunitNaran/golang4u`
3. Select category: "Announcements" (or create one)
4. Copy the generated config values

```toml
[params.page.comment]
  enable = true
  [params.page.comment.giscus]
    enable = true
    dataRepo = "PunitNaran/golang4u"
    dataRepoId = ""           # from giscus.app
    dataCategory = ""          # from giscus.app
    dataCategoryId = ""        # from giscus.app
    dataMapping = "pathname"
    dataReactionsEnabled = "1"
    dataEmitMetadata = "0"
    dataInputPosition = "bottom"
    lightTheme = "light"
    darkTheme = "dark"
    dataLang = "en"
```

---

## 🖼️ SEO & Open Graph Images

For best social media sharing, create a default OG image (1200×630px) and place it in `static/`:

```
static/
  og-image.png      # Default sharing image (1200x630px)
  logo.png          # Already exists
```

Then update config:
```toml
[params.seo]
  image = "/og-image.png"
  thumbnailUrl = "/og-image.png"
```

**Already configured:**
- ✅ `image = "/logo.png"` (using logo as fallback)

---

## 🍪 Cookie Consent

Already enabled. To customize the banner text:

```toml
[params.cookieconsent]
  enable = true
  [params.cookieconsent.content]
    message = "This website uses cookies to improve your experience."
    dismiss = "Got it!"
    link = "/privacy"    # Link to your privacy policy page
```

---

## ✅ Already Completed

| Feature | Status | Details |
|---------|--------|---------|
| Theme dropdown selector | ✅ Done | `themeChangeMode = "select"` |
| Sponsor/BuyMeACoffee | ✅ Done | Enabled on all posts |
| Author website | ✅ Done | Links to punitnaran.com |
| SEO fallback image | ✅ Done | Using /logo.png |
| Search blur fix | ✅ Done | No more dark overlay on desktop |
| Responsive header | ✅ Done | Fluid sizing with clamp() |
| Tablet breakpoint | ✅ Done | 681px-1000px optimized |

---

## 🎨 Design Enhancements (Optional)

### Custom OG Image
Use a tool like Canva or Figma to create a branded 1200×630px image with:
- Golang4U logo
- Tagline
- Brand colors

### Favicon Set
Generate a complete favicon set at https://realfavicongenerator.net/ and place files in `static/`.

### Custom 404 Page
Create a branded 404 page at `content/404.md` or `layouts/404.html`.
