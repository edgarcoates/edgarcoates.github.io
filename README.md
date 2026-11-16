# edgarcoates.github.io

Personal site. Static HTML, CSS and a little vanilla JavaScript. No build step.

## Preview locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to GitHub Pages

1. Create a public repository named `edgarcoates.github.io`.
2. Push these files to the `main` branch.

```bash
git init -b main
```

```bash
git add . && git commit -m "Publish site"
```

```bash
git remote add origin https://github.com/edgarcoates/edgarcoates.github.io.git
```

```bash
git push -u origin main
```

3. In the repository, open Settings → Pages and set the source to "Deploy from a branch", branch `main`, folder `/ (root)`.

The site is then live at https://edgarcoates.github.io within a minute or two.

## Things to maintain

| What | Where |
|---|---|
| Headshot | Replace `assets/headshot.jpg` (square, at least 400px). |
| CV | Replace `assets/Edgar_Coates_CV.pdf`. Keep the file name. |
| Copy | `index.html` and `projects/agentic-job-matcher.html`. |
| Colours and type | Tokens at the top of `assets/css/style.css`. |
| Link preview image | `assets/og.png` (1200 × 630). |
| Last-modified dates | `sitemap.xml`. |

If the site moves to a custom domain, update the absolute URLs in the `<head>` of both pages, `robots.txt` and `sitemap.xml`.
