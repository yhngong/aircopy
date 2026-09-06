# AirCopy 📋

A lightweight, serverless/static web application for easily copying and transferring text or files across devices, hosted on GitHub Pages.

## Project Structure

```
aircopy/
├── index.html      # Main HTML document
├── style.css       # Styles & UI theme
├── app.js          # Client-side logic
└── README.md       # Project documentation
```

## Running Locally

Simply open `index.html` in your browser, or start a local static server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js npx
npx serve .
```

## GitHub Pages Deployment

1. Push this repository to GitHub.
2. In your repository settings, navigate to **Settings > Pages**.
3. Under **Build and deployment > Source**, select `Deploy from a branch`.
4. Select branch `main` and folder `/ (root)`.
5. Click **Save**.
