# AirCopy 📋 ✈️

AirCopy is a zero-dependency, 100% client-side Progressive Web App (PWA) designed to transfer text between smartphones **without internet, Wi-Fi, Bluetooth, or local network connection** (completely air-gapped).

Data transfers purely through optical QR code transmission from sender screen to receiver camera.

![AirCopy Icon](icon.svg)

---

## Key Features

- ✈️ **100% Air-Gapped & Offline**: Once opened or added to your phone's home screen, works completely in Airplane Mode. All libraries (`qrcode.js` and `jsQR`) are vendored locally with zero CDN dependencies.
- 📱 **Universal Single QR Mode**: For standard text (passwords, URLs, short notes, 2FA tokens), shows a crisp high-contrast QR code that can be scanned either by AirCopy **or** directly by any native smartphone camera app (iOS Camera or Android Google Lens).
- ⚡ **High-Capacity Animated Burst Mode**: For longer text (documents, code snippets, large notes), automatically splits the text into sequential QR frames (`AIRCPY` protocol) and loops them. The receiving camera captures and reconstructs the complete text seamlessly.
- 📷 **Built-in Camera Scanner**: Hardware-accelerated scanning with `BarcodeDetector` and fallback to `jsQR` canvas processing.
- 🔄 **Camera Flip & 💡 Flashlight**: Switch between back and front cameras, with built-in torch toggle on supported devices.
- 🔔 **Offline Sound & Haptics**: Pleasant confirmation chime synthesized using the Web Audio API (zero audio files needed) and haptic vibration feedback.
- 📋 **Actions & History**: Quick "Copy to Clipboard", Web Share API integration, automatic URL detector, and offline transfer history saved in `localStorage`.

---

## How to Deploy to GitHub Pages

1. Create a repository on GitHub (e.g. `aircopy`).
2. Add your GitHub remote and push the code:
   ```bash
   git remote add origin https://github.com/<your-username>/aircopy.git
   git branch -M main
   git push -u origin main
   ```
3. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **Deploy from a branch**.
   - Select branch `main` and folder `/ (root)`.
   - Click **Save**.
4. Your app will be live at `https://<your-username>.github.io/aircopy/`.

> **Note**: Modern smartphones require an HTTPS connection to access device cameras. GitHub Pages automatically provides HTTPS for all sites.

---

## How to Test Locally

Start a simple local web server with Python:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in your web browser.

To test across two smartphones on your local network during development:
```bash
# Find your computer's local IP address
ifconfig | grep "inet " | grep -v 127.0.0.1
```
Open `http://<your-computer-ip>:8000` on both phones.

---

## License & Acknowledgments

AirCopy is open source under the [MIT License](LICENSE).

### Third-Party Libraries
This project bundles two open-source libraries locally in `lib/` to enable 100% offline capability:
- **[qrcodejs](https://github.com/davidshimjs/qrcodejs)** by davidshimjs — Licensed under the **MIT License**.
- **[jsQR](https://github.com/cozmo/jsQR)** by Cosmo Wolfe — Licensed under the **Apache License 2.0**.

For full license texts and copyright notices, see [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md).
