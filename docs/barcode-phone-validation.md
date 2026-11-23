# Phone barcode validation

## Supported formats

The camera decoder is configured for EAN-13, EAN-8, UPC-A and UPC-E (plus Code 128, Code 39, ITF, QR and Data Matrix). The browser's native `BarcodeDetector` path requests only formats that the browser reports as supported; otherwise SnapKart uses ZXing. A format being configured does not guarantee that a particular phone camera can read a particular label under store lighting.

## Device test matrix

Run the deployed HTTPS app using real labels (or high quality printed labels), not a desktop webcam emulator. For each device/browser and each of the four retail formats, perform 20 first-pass attempts at normal checkout distance and lighting. Record a successful attempt only when the correct product appears without manual entry. Note whether flashlight, autofocus, or a second attempt was needed. Repeat poor results after cleaning the lens and improving label lighting.

| Device | OS | Browser/version | Format | Attempts | First-pass decodes | Correct catalog lookups | Median lookup latency | p95 lookup latency | Notes |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| Fill during device run | | | EAN-13 | | | | | | |
| Fill during device run | | | EAN-8 | | | | | | |
| Fill during device run | | | UPC-A | | | | | | |
| Fill during device run | | | UPC-E | | | | | | |

Calculate first-pass decode rate as `first-pass decodes / attempts`; correct lookup rate as `correct catalog lookups / attempts`. Report each phone/browser separately and do not combine results until each format has at least 20 attempts per device. Physical phones are required for this matrix; automated browser tests cannot establish camera accuracy or real-device latency.

## Latency and success observations

In DevTools, run `performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('snapkart:barcode-lookup:'))`. Entry names include the detected format and outcome (`success`, `not_found` or `error`); the `duration` is client-side time from decoded text to API response. The protected backend `/metrics` endpoint exposes request counts and latency histograms for `/products/barcode/:barcode`; HTTP 200 is a successful catalog lookup and 404 is an unknown barcode. Use the existing `METRICS_TOKEN` bearer authorization and compare p50/p95 across the test window. These server metrics are in-memory and reset when the API process restarts.

For the optical decode interval, use a stopwatch or screen recording from presenting the label in the camera frame to the product result. Log all attempts, including misses, because browser/server metrics only see decoded requests. Never put real customer details or full camera images into the test log.

## Handheld scanner alternative

First evaluate a USB/Bluetooth HID scanner in keyboard-wedge mode. It types decoded digits into the focused manual barcode field and usually sends Enter; it avoids camera permission, focus, glare, and camera-distance issues. It is the least disruptive option because it needs no special browser API. Verify that the field keeps focus, Enter submits once, leading zeroes are preserved, and the scanner's configured suffix does not double-submit.

If a store needs a shared checkout station or sustained high throughput, compare a wired/stand-mounted HID scanner with phone cameras using the same labels, distances, lighting, 20 attempts per format, first-pass rate, correct lookup rate, and p50/p95 end-to-end time. Consider a vendor SDK or serial integration only if HID mode cannot meet the measured needs; those options add device management and compatibility work.
